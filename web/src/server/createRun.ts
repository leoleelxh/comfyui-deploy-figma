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

    if (apiUser)
      if (apiUser.org_id) {
        // is org api call, check org only
        if (apiUser.org_id != workflow_version_data.workflow.org_id) {
          throw new Error("Workflow not found");
        }
      } else {
        // is user api call, check user only
        if (
          apiUser.user_id != workflow_version_data.workflow.user_id &&
          workflow_version_data.workflow.org_id == null
        ) {
          throw new Error("Workflow not found");
        }
      }

    const workflow_api = workflow_version_data.workflow_api;

    // 添加日志来跟踪输入
    console.log("Initial inputs:", inputs);

    // Replace the inputs
    if (inputs && workflow_api) {
      // 1. 先处理所有图片上传
      const uploadPromises: Promise<void>[] = [];
      
      for (const key in inputs) {
        Object.entries(workflow_api).forEach(([_, node]) => {
          if (node.inputs["input_id"] === key) {
            if (node.class_type === "ComfyUIDeployExternalImage") {
              const value = inputs[key];
              if (typeof value === 'string' && value.startsWith('data:image')) {
                uploadPromises.push(
                  uploadBase64Image(value).then(url => {
                    console.log("Uploaded image URL:", url);
                    // 只设置 input_id，保持和原代码一致的逻辑
                    node.inputs["input_id"] = url;
                  })
                );
              }
            } else {
              // 其他类型节点保持原有逻辑
              node.inputs["input_id"] = inputs[key];
              
              if (node.class_type == "ComfyUIDeployExternalText") {
                node.inputs["default_value"] = inputs[key];
              }
              // 处理滑块参数
              if (node.class_type == "ComfyUIDeployExternalNumberSlider") {
                node.inputs["default_value"] = inputs[key];
              }
              // 处理 Lora 参数
              if (node.class_type == "ComfyUIDeployExternalLora") {
                node.inputs["default_value"] = inputs[key];
              }
              // 处理 Checkpoint 参数
              if (node.class_type == "ComfyUIDeployExternalCheckpoint") {
                node.inputs["default_value"] = inputs[key];
              }
              // 处理 Boolean 参数
              if (node.class_type == "ComfyUIDeployExternalBoolean") {
                const boolValue = String(inputs[key]).toLowerCase() === "true";
                node.inputs["default_value"] = boolValue;
              }

              // 添加更多日志来跟踪
              console.log("Node inputs after setting:", node.inputs);
            }
          }
        });
      }

      // 2. 等待所有图片上传完成
      await Promise.all(uploadPromises);
      console.log("All images uploaded, workflow_api:", workflow_api);
    }

    // 添加日志来查看最终的 workflow_api
    console.log("Final workflow_api:", workflow_api);

    // 处理滑块参数
    if (inputs && inputs.ComfyUIDeployExternalNumberSlider !== undefined) {
      const sliderValue = inputs.ComfyUIDeployExternalNumberSlider; // 获取滑块的值
      console.log("Slider value:", sliderValue); // 处理逻辑，例如存储或传递给其他函数
    }

    let prompt_id: string | undefined = undefined;
    const shareData = {
      workflow_api_raw: workflow_api,
      status_endpoint: `${origin}/api/update-run`,
      file_upload_endpoint: `${origin}/api/file-upload`,
    };

    prompt_id = v4();

    // 3. 创建任务记录
    const workflow_run = await db
      .insert(workflowRunsTable)
      .values({
        id: prompt_id,
        workflow_id: workflow_version_data.workflow_id,
        workflow_version_id: workflow_version_data.id,
        workflow_inputs: inputs,
        machine_id: machine.id,
        status: "not-started",
        origin: runOrigin || "manual",
      })
      .returning();

    // 异步发送任务到ComfyUI（包含重试机制）
    (async () => {
      const MAX_RETRIES = 3;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`Attempting to send task to ComfyUI (attempt ${attempt}/${MAX_RETRIES})`);
          
          let response: Response;
          switch (machine.type) {
            case "comfy-deploy-serverless":
            case "modal-serverless":
              const _data = {
                input: {
                  ...shareData,
                  prompt_id: prompt_id,
                },
              };

              response = await fetch(`${machine.endpoint}/run`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(_data),
                signal: AbortSignal.timeout(5000), // 5秒超时
                cache: "no-store",
              });
              break;

            case "runpod-serverless":
              const data = {
                input: {
                  ...shareData,
                  prompt_id: prompt_id,
                },
              };

              if (
                !machine.auth_token &&
                !machine.endpoint.includes("localhost") &&
                !machine.endpoint.includes("127.0.0.1")
              ) {
                throw new Error("Machine auth token not found");
              }

              response = await fetch(`${machine.endpoint}/run`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${machine.auth_token}`,
                },
                body: JSON.stringify(data),
                signal: AbortSignal.timeout(5000), // 5秒超时
                cache: "no-store",
              });
              break;

            case "classic":
            default:
              const body = {
                ...shareData,
                prompt_id: prompt_id,
              };
              const comfyui_endpoint = `${machine.endpoint}/comfyui-deploy/run`;
              response = await fetch(comfyui_endpoint, {
                method: "POST",
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(5000), // 5秒超时
                cache: "no-store",
              });
              break;
          }

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          // 如果成功，更新状态为 running
          await db
            .update(workflowRunsTable)
            .set({
              status: "running",
              started_at: new Date(),
            })
            .where(eq(workflowRunsTable.id, workflow_run[0].id));

          return; // 成功后退出重试循环
        } catch (error) {
          lastError = error as Error;
          console.error(`Attempt ${attempt} failed:`, error);
          if (attempt < MAX_RETRIES) {
            // 等待一段时间后重试，使用指数退避
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          }
        }
      }

      // 所有重试都失败后，更新状态为 failed
      await db
        .update(workflowRunsTable)
        .set({
          status: "failed",
          ended_at: new Date(),
          workflow_inputs: {
            ...inputs,
            __error: `Failed to connect to ComfyUI after ${MAX_RETRIES} attempts. Last error: ${lastError?.message}`
          }
        })
        .where(eq(workflowRunsTable.id, workflow_run[0].id));
    })();

    // 立即返回任务ID
    return {
      workflow_run_id: workflow_run[0].id,
      message: "Workflow run created"
    };
  }
);

export async function checkStatus(run_id: string) {
  const { userId } = auth();
  if (!userId) throw new Error("User not found");

  return await getRunsData(run_id);
}
