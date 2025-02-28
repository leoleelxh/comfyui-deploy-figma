import { registerCreateRunRoute } from "@/routes/registerCreateRunRoute";
import { registerGetOutputRoute } from "@/routes/registerGetOutputRoute";
import { registerUploadRoute } from "@/routes/registerUploadRoute";
import { registerDeploymentsRoute } from "@/routes/registerDeploymentsRoute";
import { isKeyRevoked } from "@/server/curdApiKeys";
import { parseJWT } from "@/server/parseJWT";
import type { Context, Next } from "hono";
import { handle } from "hono/vercel";
import { app } from "../../../../routes/app";
import { registerWorkflowUploadRoute } from "@/routes/registerWorkflowUploadRoute";
import { registerGetAuthResponse } from "@/routes/registerGetAuthResponse";
import { registerGetWorkflowRoute } from "@/routes/registerGetWorkflow";
import { cors } from "hono/cors";
import { registerGetStatusRoute } from "@/routes/registerGetStatusRoute";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60 seconds
export const runtime = 'edge';

declare module "hono" {
  interface ContextVariableMap {
    apiKeyTokenData: ReturnType<typeof parseJWT>;
  }
}

async function checkAuth(c: Context, next: Next) {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");

  if (!token) return c.text("No token", { status: 401 });

  const userData = await parseJWT(token);

  if (!userData) return c.text("Invalid token", { status: 401 });

  // If the key has expiration, this is a temporary key and not in our db, so we can skip checking
  if (userData.exp === undefined) {
    const revokedKey = await isKeyRevoked(token);
    if (revokedKey)
      return c.text("Revoked token", {
        status: 401,
      });
  }

  c.set("apiKeyTokenData", userData);

  await next();
}

const corsHandler = cors({
  origin: '*',
  allowHeaders: ['*'],  
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],  
  exposeHeaders: ['*'],  
  maxAge: 86400, 
  credentials: true,
});

// 确保 CORS 中间件在所有路由之前
app.use('*', corsHandler);

// 认证检查
app.use("/run", checkAuth);
app.use("/upload-url", checkAuth);
app.use("/workflow", checkAuth);
app.use("/workflow-version/*", checkAuth);
app.use("/deployments", checkAuth);
app.use("/status/*", checkAuth);

// create run endpoint
registerCreateRunRoute(app);
registerGetOutputRoute(app);

// file upload endpoint
registerUploadRoute(app);
registerDeploymentsRoute(app);

// Anon
registerGetAuthResponse(app);

registerWorkflowUploadRoute(app);
registerGetWorkflowRoute(app);

// The OpenAPI documentation will be available at /doc
app.doc("/doc", {
  openapi: "3.0.0",
  servers: [{ url: "/api" }],
  security: [{ bearerAuth: [] }],
  info: {
    version: "0.0.1",
    title: "Comfy Deploy API",
    description:
      "Interact with Comfy Deploy programmatically to trigger run and retrieve output",
  },
});

app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
  type: "apiKey",
  bearerFormat: "JWT",
  in: "header",
  name: "Authorization",
  description:
    "API token created in Comfy Deploy <a href='/api-keys' target='_blank' style='text-decoration: underline;'>/api-keys</a>",
});

// Add status route
registerGetStatusRoute(app);

// 添加调试日志
app.use("*", async (c, next) => {
  console.log('Request path:', c.req.path);
  await next();
});

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
