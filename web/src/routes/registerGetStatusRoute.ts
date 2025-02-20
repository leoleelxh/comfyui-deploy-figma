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

    try {
      const run = await db.query.workflowRunsTable.findFirst({
        where: eq(workflowRunsTable.id, run_id),
        with: {
          outputs: true,
        },
      });

      if (!run) {
        return c.json(
          { error: "Run not found" },
          { status: 404 }
        );
      }

      console.log('Requested run_id:', run_id);
      console.log('Found run:', run);

      return c.json({
        id: run.id,
        status: run.status,
        outputs: run.outputs,
      });
    } catch (error: any) {
      console.error('Error fetching run status:', error);
      return c.json(
        { error: error.message },
        { status: 500 }
      );
    }
  });
}; 