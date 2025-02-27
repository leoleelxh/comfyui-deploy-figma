import { parseDataSafe } from "../../../../lib/parseDataSafe";
import { db } from "@/db/db";
import { workflowRunOutputs, workflowRunsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

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

export async function POST(request: Request) {
  const [data, error] = await parseDataSafe(Request, request);
  if (!data || error) return error;

  const { run_id, status, output_data, inputs } = data;

  // console.log(run_id, status, output_data);

  if (output_data) {
    // 处理图片数据
    if (output_data.images) {
      for (const image of output_data.images) {
        // 总是使用标准格式构建 URL
        image.url = `${CDN_ENDPOINT}/${BUCKET}/outputs/runs/${run_id}/${image.filename}`;
        if (image.thumbnail) {
          image.thumbnail_url = `${CDN_ENDPOINT}/${BUCKET}/outputs/runs/${run_id}/thumbnails/${image.filename}`;
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
