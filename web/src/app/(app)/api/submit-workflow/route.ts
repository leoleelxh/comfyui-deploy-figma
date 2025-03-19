import { parseDataSafe } from "../../../../lib/parseDataSafe";
import { db } from "@/db/db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  workflowRunsTable,
  workflowRunOutputs,
  workflowVersionTable,
} from "@/db/schema";
import { getWorkflowOutputKeys } from "@/components/flow-run-form/useProcessWorkflowJson";

// 根据环境变量使用不同的运行时
export const runtime = process.env.ENVIRONMENT === "cloudflare" ? "edge" : "nodejs";
export const preferredRegion = "auto";
export const dynamic = "force-dynamic";

// 输入验证结构
const Request = z.object({
  workflow_version_id: z.string(),
  inputs: z.record(z.any()),
});

export async function POST(request: Request) {
  // 解析请求数据
  const [data, error] = await parseDataSafe(Request, request);
  if (!data || error) return error;

  const { workflow_version_id, inputs } = data;

  // 查询工作流版本
  const workflow_version = await db.query.workflowVersionTable.findFirst({
    where: eq(workflowVersionTable.id, workflow_version_id),
  });

  if (!workflow_version) {
    return NextResponse.json(
      {
        message: "workflow version not found",
      },
      {
        status: 404,
      }
    );
  }

  // 生成唯一运行 ID
  const run_id = nanoid();

  // 创建工作流运行记录
  await db.insert(workflowRunsTable).values({
    id: run_id,
    workflow_version_id: workflow_version_id,
    workflow_id: workflow_version.workflow_id,
    status: "not-started",
    workflow_data: workflow_version.data,
    started_at: new Date(),
    inputs: inputs,
  });

  // 准备后端请求
  const backend_url = process.env.COMFYUI_BACKEND_URL || "";
  const payload = {
    run_id,
    workflow_data: workflow_version.data,
    output_fields: getWorkflowOutputKeys(workflow_version.data),
    workflow_version_id,
    inputs,
  };

  // 异步发送请求到后端服务
  fetch(backend_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).then((res) => {
    res.json().then((data) => {
      // 异步更新工作流状态
      if (data.message !== "success") {
        db.update(workflowRunsTable)
          .set({
            status: "failed",
            ended_at: new Date(),
          })
          .where(eq(workflowRunsTable.id, run_id))
          .execute();
      }
    });
  });

  // 返回成功响应
  return NextResponse.json(
    {
      message: "success",
      run_id: run_id,
    },
    {
      status: 200,
    }
  );
} 