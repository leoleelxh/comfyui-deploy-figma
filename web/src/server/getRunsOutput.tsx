"use server";

import { RunOutputs } from "@/components/RunOutputs";
import { db } from "@/db/db";
import { workflowRunOutputs } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getRunsOutputDisplay(run_id: string) {
  return <RunOutputs run_id={run_id} />;
}

export async function getRunsOutput(run_id: string) {
  // 修改查询，只获取必要字段，限制返回数量
  return await db
    .select({
      id: workflowRunOutputs.id,
      created_at: workflowRunOutputs.created_at,
      updated_at: workflowRunOutputs.updated_at,
      data: workflowRunOutputs.data
    })
    .from(workflowRunOutputs)
    .where(eq(workflowRunOutputs.run_id, run_id))
    .limit(5); // 限制返回数量，减少数据库传输
}
