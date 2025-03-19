import { db } from "@/db/db";
import { workflowTable } from "@/db/schema";
import { NextResponse } from "next/server";
import { checkAuth } from "../[[...routes]]/route";
import { eq } from "drizzle-orm";
import { parseDataSafe } from "@/lib/parseDataSafe";
import { z } from "zod";

// 根据环境变量使用不同的运行时
export const runtime = process.env.ENVIRONMENT === "cloudflare" ? "edge" : "nodejs";
export const preferredRegion = "auto";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // 验证认证
  const auth = await checkAuth({
    request: request,
    requiredScopes: ["workflows:read"],
  });

  if (!auth.valid) {
    return NextResponse.json(
      {
        message: "unauthorized",
      },
      {
        status: 401,
      }
    );
  }

  // 获取所有工作流
  const workflows = await db.query.workflowTable.findMany({
    with: {
      versions: {
        limit: 1,
        orderBy: (version, { desc }) => [desc(version.createdAt)],
      },
    },
  });

  // 返回工作流数据
  return NextResponse.json(
    {
      message: "success",
      workflows,
    },
    {
      status: 200,
    }
  );
}

// 创建工作流请求结构
const CreateWorkflowRequest = z.object({
  name: z.string(),
  data: z.any(), // JSON workflow data
});

export async function POST(request: Request) {
  // 验证认证
  const auth = await checkAuth({
    request: request,
    requiredScopes: ["workflows:write"],
  });

  if (!auth.valid) {
    return NextResponse.json(
      {
        message: "unauthorized",
      },
      {
        status: 401,
      }
    );
  }

  // 解析请求数据
  const [data, error] = await parseDataSafe(CreateWorkflowRequest, request);
  if (!data || error) return error;

  const { name, data: workflowData } = data;

  // 创建新工作流
  const workflow = await db
    .insert(workflowTable)
    .values({
      name,
    })
    .returning();

  // 返回成功信息
  return NextResponse.json(
    {
      message: "success",
      workflow: workflow[0],
    },
    {
      status: 200,
    }
  );
} 