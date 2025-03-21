"use server";

import { db } from "@/db/db";
import type {
  MachineType,
  WorkflowRunOriginType,
  WorkflowVersionType,
} from "@/db/schema";
import { machinesTable, workflowRunsTable } from "@/db/schema";
import type { APIKeyUserType } from "@/server/APIKeyBodyRequest";
import { getRunsData } from "@/server/getRunsData";
import { ComfyAPI_Run } from "@/types/ComfyAPI_Run";
import { auth } from "@clerk/nextjs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import "server-only";
import { v4 } from "uuid";
import { withServerPromise } from "./withServerPromise";
import { uploadBase64Image } from "./uploadBase64Image";
import { isValidImageUrl } from "./isValidImageUrl";

export const createRun = withServerPromise(
  async ({
    origin,
    workflow_version_id,
    machine_id,
    inputs,
    runOrigin,
    apiUser,
  }: {
    origin: string;
    workflow_version_id: string | WorkflowVersionType;
    machine_id: string | MachineType;
    inputs?: Record<string, string | number>;
    runOrigin?: WorkflowRunOriginType;
    apiUser?: APIKeyUserType;
  }) => {
    // 验证机器和工作流
    const machine =
      typeof machine_id === "string"
        ? await db.query.machinesTable.findFirst({
            where: and(
              eq(machinesTable.id, machine_id),
              eq(machinesTable.disabled, false),
            ),
          })
        : machine_id;

    if (!machine) {
      throw new Error("Machine not found");
    }

    const workflow_version_data =
      typeof workflow_version_id === "string"
        ? await db.query.workflowVersionTable.findFirst({
            where: eq(workflowRunsTable.id, workflow_version_id),
            with: {
              workflow: {
                columns: {
                  org_id: true,
                  user_id: true,
                },
              },
            },
          })
        : workflow_version_id;

    if (!workflow_version_data) {
      throw new Error("Workflow version not found");
    }

    // 权限检查
    if (apiUser) {
      if (apiUser.org_id) {
        if (apiUser.org_id != workflow_version_data.workflow.org_id) {
          throw new Error("Workflow not found");
        }
      } else {
        if (
          apiUser.user_id != workflow_version_data.workflow.user_id &&
          workflow_version_data.workflow.org_id == null
        ) {
          throw new Error("Workflow not found");
        }
      }
    }

    const workflow_api = workflow_version_data.workflow_api;

    // 处理输入参数
    if (inputs && workflow_api) {
      // 先处理所有图片上传
      const uploadPromises: Promise<void>[] = [];
      
      console.log("Initial inputs:", inputs);
      
      for (const key in inputs) {
        Object.entries(workflow_api).forEach(([_, node]) => {
          if (node.inputs["input_id"] === key) {
            if (node.class_type === "ComfyUIDeployExternalImage") {
              const value = inputs[key];
              if (typeof value === 'string') {
                if (isValidImageUrl(value)) {
                  // 如果是有效的图片 URL，直接使用
                  console.log(`Using valid image URL for key: ${key}`);
                  node.inputs["input_id"] = value;
                } else if (value.startsWith('data:image')) {
                  // 如果是 base64 数据，上传处理
                  console.log(`Processing image upload for key: ${key}`);
                  uploadPromises.push(
                    uploadBase64Image(value).then(url => {
                      console.log(`Image uploaded successfully, URL: ${url}`);
                      node.inputs["input_id"] = url;
                    })
                  );
                }
              }
            } else {
              node.inputs["input_id"] = inputs[key];
              
              if (node.class_type == "ComfyUIDeployExternalText") {
                node.inputs["default_value"] = inputs[key];
              }
              if (node.class_type == "ComfyUIDeployExternalNumberSlider") {
                node.inputs["default_value"] = inputs[key];
              }
              if (node.class_type == "ComfyUIDeployExternalLora") {
                node.inputs["default_value"] = inputs[key];
              }
              if (node.class_type == "ComfyUIDeployExternalCheckpoint") {
                node.inputs["default_value"] = inputs[key];
              }
              if (node.class_type == "ComfyUIDeployExternalBoolean") {
                const boolValue = String(inputs[key]).toLowerCase() === "true";
                node.inputs["default_value"] = boolValue;
              }
            }
          }
        });
      }
      
      // 等待所有图片上传完成
      if (uploadPromises.length > 0) {
        console.log(`Waiting for ${uploadPromises.length} image uploads to complete...`);
        await Promise.all(uploadPromises);
        console.log("All images uploaded successfully");
      }

      console.log("Final workflow_api:", workflow_api);
    }

    const prompt_id = v4();
    const shareData = {
      workflow_api_raw: workflow_api,
      status_endpoint: `${origin}/api/update-run`,
      file_upload_endpoint: `${origin}/api/file-upload`,
    };

    // 创建任务记录
    const workflow_run = await db
      .insert(workflowRunsTable)
      .values({
        id: prompt_id,
        workflow_id: workflow_version_data.workflow_id,
        workflow_version_id: workflow_version_data.id,
        workflow_inputs: inputs,
        machine_id: machine.id,
        origin: runOrigin,
        status: "not-started",
        started_at: new Date()
      })
      .returning();

    revalidatePath(`/${workflow_version_data.workflow_id}`);

    const MAX_RETRIES = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        let response: Response;
        switch (machine.type) {
          case "comfy-deploy-serverless":
          case "modal-serverless":
            const _data = {
              input: {
                ...shareData,
                prompt_id: workflow_run[0].id,
              },
            };

            response = await Promise.race([
              fetch(`${machine.endpoint}/run`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(_data),
                cache: "no-store",
              }),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout')), 10000)
              ),
            ]) as Response;

            if (!response.ok) {
              throw new Error(
                `Error creating run, ${response.statusText} ${await response.text()}`,
              );
            }
            break;

          case "runpod-serverless":
            const data = {
              input: {
                ...shareData,
                prompt_id: workflow_run[0].id,
              },
            };

            if (
              !machine.auth_token &&
              !machine.endpoint.includes("localhost") &&
              !machine.endpoint.includes("127.0.0.1")
            ) {
              throw new Error("Machine auth token not found");
            }

            response = await Promise.race([
              fetch(`${machine.endpoint}/run`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${machine.auth_token}`,
                },
                body: JSON.stringify(data),
                cache: "no-store",
              }),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout')), 10000)
              ),
            ]) as Response;

            if (!response.ok) {
              throw new Error(
                `Error creating run, ${response.statusText} ${await response.text()}`,
              );
            }
            break;

          case "classic":
          default:
            const body = {
              ...shareData,
              prompt_id: workflow_run[0].id,
            };
            const comfyui_endpoint = `${machine.endpoint}/comfyui-deploy/run`;
            response = await Promise.race([
              fetch(comfyui_endpoint, {
                method: "POST",
                body: JSON.stringify(body),
                cache: "no-store",
              }),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout')), 10000)
              ),
            ]) as Response;

            if (!response.ok) {
              let message = `Error creating run, ${response.statusText}`;
              try {
                const result = await ComfyAPI_Run.parseAsync(await response.json());
                message += ` ${result.node_errors}`;
              } catch (error) {}
              throw new Error(message);
            }
            break;
        }

        // 任务发送成功后，不立即更新状态，让 ComfyUI 通过 update-run 更新状态
        return {
          workflow_run_id: workflow_run[0].id,
          message: "Successful workflow run",
        };

      } catch (error: any) {
        lastError = error;
        console.error(`Attempt ${attempt} failed:`, error);

        // 如果是超时错误，也不更新状态
        if (error.message === 'Request timeout') {
          return {
            workflow_run_id: workflow_run[0].id,
            message: "Workflow run initiated (timeout occurred but request may have succeeded)",
          };
        }

        // 如果还有重试机会，等待后重试
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, Math.min(2000 * attempt, 6000)));
          continue;
        }
      }
    }

    // 所有重试都失败时才更新状态为 failed
    await db
      .update(workflowRunsTable)
      .set({
        status: "failed",
        ended_at: new Date()
      })
      .where(eq(workflowRunsTable.id, workflow_run[0].id));

    throw lastError || new Error("Failed to send task to ComfyUI");
  }
);

export async function checkStatus(run_id: string) {
  const { userId } = auth();
  if (!userId) throw new Error("User not found");

  return await getRunsData(run_id);
}
