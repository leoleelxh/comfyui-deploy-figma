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

    // Replace the inputs
    if (inputs && workflow_api) {
      for (const key in inputs) {
        Object.entries(workflow_api).forEach(([_, node]) => {
          if (node.inputs["input_id"] === key) {
            node.inputs["input_id"] = inputs[key];
            
            // Fix for external text default value
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
          }
        });
      }
    }

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

    // 1. 创建任务记录
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

    // 2. 立即返回任务 ID
    const response = {
      workflow_run_id: workflow_run[0].id,
      message: "Workflow run created",
    };

    // 3. 异步处理机器请求
    (async () => {
      try {
        // 处理工作流中的所有图片输入
        if (inputs) {
          for (const [key, value] of Object.entries(inputs)) {
            if (typeof value === 'string' && value.startsWith('data:image')) {
              // 将 base64 图片转换为 CDN URL
              inputs[key] = await uploadBase64Image(value);
            }
          }
        }

        switch (machine.type) {
          case "comfy-deploy-serverless":
          case "modal-serverless":
            const _data = {
              input: {
                ...shareData,
                prompt_id: prompt_id,
              },
            };

            const ___result = await fetch(`${machine.endpoint}/run`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(_data),
              cache: "no-store",
            });
            console.log(___result);
            if (!___result.ok)
              throw new Error(
                `Error creating run, ${
                  ___result.statusText
                } ${await ___result.text()}`,
              );
            console.log(_data, ___result);
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

            const __result = await fetch(`${machine.endpoint}/run`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${machine.auth_token}`,
              },
              body: JSON.stringify(data),
              cache: "no-store",
            });
            console.log(__result);
            if (!__result.ok)
              throw new Error(
                `Error creating run, ${
                  __result.statusText
                } ${await __result.text()}`,
              );
            console.log(data, __result);
            break;
          case "classic":
            const body = {
              ...shareData,
              prompt_id: prompt_id,
            };
            // console.log(body);
            const comfyui_endpoint = `${machine.endpoint}/comfyui-deploy/run`;
            const _result = await fetch(comfyui_endpoint, {
              method: "POST",
              body: JSON.stringify(body),
              cache: "no-store",
            });
            // console.log(_result);

            if (!_result.ok) {
              let message = `Error creating run, ${_result.statusText}`;
              try {
                const result = await ComfyAPI_Run.parseAsync(
                  await _result.json(),
                );
                message += ` ${result.node_errors}`;
              } catch (error) {}
              throw new Error(message);
            }
            // prompt_id = result.prompt_id;
            break;
        }
        
        // 更新状态为运行中
        await db.update(workflowRunsTable)
          .set({ 
            status: "running",
            started_at: new Date()
          })
          .where(eq(workflowRunsTable.id, workflow_run[0].id));

      } catch (error) {
        console.error('Machine request failed:', error);
        // 更新状态为失败
        await db.update(workflowRunsTable)
          .set({ 
            status: "failed",
            ended_at: new Date()
          })
          .where(eq(workflowRunsTable.id, workflow_run[0].id));
      }
    })().catch(console.error);

    return response;
  },
);

export async function checkStatus(run_id: string) {
  const { userId } = auth();
  if (!userId) throw new Error("User not found");

  return await getRunsData(run_id);
}
