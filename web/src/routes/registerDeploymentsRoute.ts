import { db } from "@/db/db";
import { deploymentsTable } from "@/db/schema";
import type { App } from "@/routes/app";
import { authError } from "@/routes/authError";
import { z, createRoute } from "@hono/zod-openapi";
import { and, eq, isNull } from "drizzle-orm";

const route = createRoute({
  method: "get",
  path: "/deployments",
  tags: ["deployments"],
  summary: "Get deployments list",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(z.object({
            id: z.string(),
            workflow_id: z.string(),
            machine_id: z.string(),
            environment: z.string(),
            // ... 其他字段
          }))
        },
      },
      description: "List of deployments",
    },
    ...authError,
  },
});

export const registerDeploymentsRoute = (app: App) => {
  app.openapi(route, async (c) => {
    const { org_id, user_id } = c.get("apiKeyTokenData")!;

    try {
      const deployments = await db.query.deploymentsTable.findMany({
        where: org_id 
          ? eq(deploymentsTable.org_id, org_id as string)
          : and(
              eq(deploymentsTable.user_id, user_id as string),
              isNull(deploymentsTable.org_id)
            ),
        with: {
          workflow: true,
          machine: true,
          version: true,
        },
      });

      return c.json(deployments);
    } catch (error: any) {
      return c.json(
        { error: error.message },
        { status: 500 }
      );
    }
  });
}; 