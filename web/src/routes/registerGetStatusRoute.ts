import { db } from "@/db/db";
import { workflowRunsTable, workflowRunOutputs } from "@/db/schema";
import type { App } from "@/routes/app";
import { authError } from "@/routes/authError";
import { z, createRoute } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";

// 定义路由
const route = createRoute({
  method: "get",
  path: "/status/{run_id}",
  tags: ["runs"],
  summary: "Get run status",
  request: {
    params: z.object({
      run_id: z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            status: z.string(),
            outputs: z.array(z.any()).optional(),
          }),
        },
      },
      description: "Run status and outputs",
    },
    ...authError,
  },
});

// 状态消息函数
function getProgressMessage(status: string, queuePosition?: number): string {
  if (queuePosition !== undefined) {
    return `Queued (Position: ${queuePosition}). Please wait...`;
  }
  
  switch(status) {
    case 'not-started': return 'Waiting to start';
    case 'running': return 'Generating image';
    case 'uploading': return 'Uploading results';
    case 'success': return 'Generation completed';
    case 'failed': return 'Generation failed';
    default: return 'Unknown status';
  }
}

// 构建 URL 的辅助函数
function buildStorageUrl(cdnEndpoint: string, bucket: string, path: string) {
  const dontIncludeBucket = process.env.SPACES_CDN_DONT_INCLUDE_BUCKET === "true";
  const forcePathStyle = process.env.SPACES_CDN_FORCE_PATH_STYLE === "true";
  
  // 如果强制使用路径风格，或者需要包含 bucket
  if (forcePathStyle || !dontIncludeBucket) {
    return `${cdnEndpoint}/${bucket}/${path}`;
  }
  
  // 否则直接使用路径（R2 的默认行为）
  return `${cdnEndpoint}/${path}`;
}

// 主路由处理器
export const registerGetStatusRoute = (app: App) => {
  app.openapi(route, async (c) => {
    const { run_id } = c.req.param();
    const CDN_ENDPOINT = process.env.SPACES_ENDPOINT_CDN;
    const BUCKET = process.env.SPACES_BUCKET;
    
    console.log('Fetching status for run:', run_id);

    try {
      // 获取运行记录
      const run = await db.query.workflowRunsTable.findFirst({
        where: eq(workflowRunsTable.id, run_id),
        with: {
          outputs: true,
          machine: true,
          version: true,
          workflow: true,
        },
      });

      if (!run) {
        return c.json({ error: "Run not found" }, { status: 404 });
      }

      // 处理图片输出
      const imageOutputs = run.outputs.find(output => output.data?.images);
      const images = imageOutputs?.data?.images || [];

      // 获取队列位置
      const queuePosition = run.workflow_inputs?.__queue_position;
      
      // 确定实际状态
      let actualStatus = run.status;
      if (queuePosition !== undefined && actualStatus === 'not-started') {
        actualStatus = 'queued';  // 新增一个虚拟状态，但不存入数据库
      }
      
      // 构建响应
      return c.json({
        id: run.id,
        status: actualStatus,  // 使用包含队列状态的实际状态
        started_at: run.started_at,
        ended_at: run.ended_at,
        duration: run.ended_at ? 
          (new Date(run.ended_at).getTime() - new Date(run.started_at!).getTime()) / 1000 : 
          null,
        outputs: run.outputs.map(output => ({
          ...output.data,
          created_at: output.created_at
        })),
        images: images.map((image: any) => ({
          ...image,
          url: image.url || buildStorageUrl(CDN_ENDPOINT!, BUCKET!, `outputs/runs/${run_id}/${image.filename}`),
          thumbnail_url: image.thumbnail_url || buildStorageUrl(CDN_ENDPOINT!, BUCKET!, `outputs/runs/${run_id}/thumbnails/${image.filename}`)
        })),
        error: run.status === 'failed' ? run.outputs[run.outputs.length - 1]?.data?.error : undefined,
        queue_info: queuePosition !== undefined ? {
          position: queuePosition,
          estimated_time: '2-3 minutes'  // 可以根据实际情况计算或固定值
        } : undefined,
        progress: {
          current: run.status === 'success' ? 100 : 
                  run.status === 'failed' ? 0 :
                  run.status === 'uploading' ? 75 :
                  run.status === 'running' ? 50 :
                  queuePosition !== undefined ? 25 : 0,
          total: 100,
          message: getProgressMessage(actualStatus, queuePosition)
        }
      });
    } catch (error: any) {
      console.error('Error details:', error);
      return c.json({ error: error.message }, { status: 500 });
    }
  });
}; 