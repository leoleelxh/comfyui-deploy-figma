import { db } from "@/db/db";
import { workflowRunsTable, workflowRunOutputs } from "@/db/schema";
import type { App } from "@/routes/app";
import { authError } from "@/routes/authError";
import { z, createRoute } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";

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

export const registerGetStatusRoute = (app: App) => {
  app.openapi(route, async (c) => {
    const { run_id } = c.req.param();
    
    // 获取请求的origin
    const proto = c.req.headers.get('x-forwarded-proto') || 'http';
    const host = c.req.headers.get('x-forwarded-host') || c.req.headers.get('host') || 'localhost:3000';
    const origin = `${proto}://${host}`;
    
    console.log('Request headers:', {
      proto,
      host,
      origin,
      all: Object.fromEntries(c.req.raw.headers.entries())
    });

    console.log('Fetching status for run:', run_id);

    try {
      const run = await db.query.workflowRunsTable.findFirst({
        where: eq(workflowRunsTable.id, run_id),
        with: {
          outputs: true,
          machine: true,
          version: true,
          workflow: true,
        },
      });

      console.log('Found run:', {
        id: run?.id,
        status: run?.status,
        outputs_count: run?.outputs?.length
      });

      if (!run) {
        return c.json({ error: "Run not found" }, { status: 404 });
      }

      // 找到包含图片的输出
      const imageOutputs = run.outputs.find(output => output.data?.images);
      const images = imageOutputs?.data?.images || [];

      const response = {
        id: run.id,
        status: run.status,
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
          url: image.url || `${origin}/api/view?file=outputs/runs/${run_id}/${image.filename}`,
          thumbnail_url: image.thumbnail_url || `${origin}/api/view?file=outputs/runs/${run_id}/thumbnails/${image.filename}`
        })),
        error: run.status === 'failed' ? run.outputs[run.outputs.length - 1]?.data?.error : undefined,
        progress: {
          current: run.status === 'success' ? 100 : 
                  run.status === 'failed' ? 0 :
                  run.status === 'running' ? 50 : 0,
          total: 100,
          message: getProgressMessage(run.status)
        }
      };

      console.log('Returning response:', {
        status: response.status,
        images_count: response.images.length,
        outputs_count: response.outputs.length
      });

      return c.json(response);
    } catch (error: any) {
      console.error('Error details:', error);
      return c.json({ error: error.message }, { status: 500 });
    }
  });
};

function getProgressMessage(status: string): string {
  switch(status) {
    case 'not-started':
      return 'Waiting to start';
    case 'running':
      return 'Generating image';
    case 'uploading':
      return 'Uploading results';
    case 'success':
      return 'Generation completed';
    case 'failed':
      return 'Generation failed';
    default:
      return 'Unknown status';
  }
} 