import { parseDataSafe } from "../../../../lib/parseDataSafe";
import { db } from "@/db/db";
import { workflowRunOutputs, workflowRunsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { replaceCDNUrl } from "@/server/replaceCDNUrl";
import { sanitizeOutput } from "@/server/sanitizeOutput";

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

// 添加一个函数用于彻底清理图像数据
function sanitizeImageData(images) {
  if (!images || !Array.isArray(images)) return images;
  
  for (const image of images) {
    // 删除所有可能的大型数据属性，但保留必要的元数据
    if (image.data) delete image.data;
    if (image.raw_data) delete image.raw_data;
    if (image.base64) delete image.base64;
    if (image.mask) delete image.mask;
    if (image.seed_info && typeof image.seed_info === 'string' && image.seed_info.length > 1000) {
      // 如果seed_info很大，只保留基本信息
      try {
        const seedInfo = JSON.parse(image.seed_info);
        image.seed_info = { seed: seedInfo.seed }; // 只保留种子值
      } catch (e) {
        delete image.seed_info; // 如果解析失败，直接删除
      }
    }
    
    // 确保有需要的字段
    if (!image.filename) {
      console.warn("Image missing filename:", image);
    }
  }
  
  return images;
}

export async function POST(request: Request) {
  const [data, error] = await parseDataSafe(Request, request);
  if (!data || error) return error;

  const { run_id, status, output_data, inputs } = data;

  if (output_data) {
    // 使用sanitizeOutput函数清理数据，减少数据库传输
    const cleanedOutput = sanitizeOutput(output_data);
    
    // 处理图片数据（添加URL，现有代码保持不变）
    if (cleanedOutput.images) {
      for (const image of cleanedOutput.images) {
        // 使用 replaceCDNUrl 函数来处理 URL
        image.url = replaceCDNUrl(`${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET}/outputs/runs/${run_id}/${image.filename}`);
        if (image.thumbnail) {
          // 同样使用 replaceCDNUrl 函数处理缩略图 URL
          image.thumbnail_url = replaceCDNUrl(`${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET}/outputs/runs/${run_id}/thumbnails/${image.filename}`);
        }
      }
    }

    // 处理滑块参数
    if (inputs) {
      if (inputs.ComfyUIDeployExternalNumberSlider) {
        // 处理滑块的逻辑
      }
    }

    // 保存清理后的输出记录
    await db.insert(workflowRunOutputs).values({
      run_id: run_id,
      data: cleanedOutput,
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
