import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from "./schema";

const isDevContainer = process.env.REMOTE_CONTAINERS !== undefined;

// if we're running locally
if (process.env.VERCEL_ENV !== "production") {
  // Set the WebSocket proxy to work with the local instance
  if (isDevContainer) {
    // Running inside a VS Code devcontainer
    neonConfig.wsProxy = (host) => "host.docker.internal:5481/v1";
  } else {
    // Not running inside a VS Code devcontainer
    neonConfig.wsProxy = (host) => `${host}:5481/v1`;
  }
  // Disable all authentication and encryption
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

// 使用支持 edge runtime 的数据库客户端
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, {
  schema,
});
