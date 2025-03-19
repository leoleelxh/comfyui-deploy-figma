import { parseDataSafe } from "../../../../lib/parseDataSafe";
import { db } from "@/db/db";
import { workflowRunOutputs, workflowRunsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { replaceCDNUrl } from "@/server/replaceCDNUrl";

const CDN_ENDPOINT = process.env.SPACES_ENDPOINT_CDN;
const BUCKET = process.env.SPACES_BUCKET;

const Request = z.object({
  run_id: z.string(),
  status: z
    .enum(["not-started", "running", "uploading", "success", "failed"])
    .optional(),
  output_data: z.any().optional(),
  inputs: z.record(z.union([z.string(), z.number()])).optional(),
});

// 根据环境变量使用不同的运行时
export const runtime = process.env.ENVIRONMENT === "cloudflare" ? "edge" : "nodejs";
export const preferredRegion = "auto";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const [data, error] = await parseDataSafe(Request, request);
  if (!data || error) return error;

  const { run_id, status, output_data, inputs } = data;

  // console.log(run_id, status, output_data);

  if (output_data) {
    // 处理图片数据
    if (output_data.images) {
      for (const image of output_data.images) {
        // 使用 replaceCDNUrl 函数来处理 URL
        image.url = replaceCDNUrl(`${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET}/outputs/runs/${run_id}/${image.filename}`);
        if (image.thumbnail) {
          // 同样使用 replaceCDNUrl 函数处理缩略图 URL
          image.thumbnail_url = replaceCDNUrl(`${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET}/outputs/runs/${run_id}/thumbnails/${image.filename}`);
        }
        // 删除原始数据以节省空间
        if (image.data) {
          delete image.data;
        }
      }
    }

    // 处理滑块参数
    if (inputs) {
      if (inputs.ComfyUIDeployExternalNumberSlider) {
        // 处理滑块的逻辑
      }
    }

    // 保存输出记录
    await db.insert(workflowRunOutputs).values({
      run_id: run_id,
      data: output_data,
    });
  } else if (status) {
    // console.log("status", status);
    const workflow_run = await db
      .update(workflowRunsTable)
      .set({
        status: status,
        ended_at:
          status === "success" || status === "failed" ? new Date() : null,
      })
      .where(eq(workflowRunsTable.id, run_id))
      .returning();
  }

  // const workflow_version = await db.query.workflowVersionTable.findFirst({
  //   where: eq(workflowRunsTable.id, workflow_run[0].workflow_version_id),
  // });

  // revalidatePath(`./${workflow_version?.workflow_id}`);

  return NextResponse.json(
    {
      message: "success",
    },
    {
      status: 200,
    }
  );
}
