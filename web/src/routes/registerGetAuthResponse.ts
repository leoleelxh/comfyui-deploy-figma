import { db } from "@/db/db";
import { authRequestsTable } from "@/db/schema";
import type { App } from "@/routes/app";
import { authError } from "@/routes/authError";
import { z, createRoute } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { SignJWT } from 'jose';
import { getOrgOrUserDisplayName } from "@/server/getOrgOrUserDisplayName";
import ms from "ms";
import { JWTPayload } from "@/server/parseJWT";

const route = createRoute({
  method: "get",
  path: "/auth-response/:request_id",
  tags: ["comfyui"],
  summary: "Get an API Key with code",
  description:
    "This endpoints is specifically built for ComfyUI workflow upload.",
  request: {
    params: z.object({
      request_id: z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            api_key: z.string(),
            name: z.string(),
          }),
        },
      },
      description: "The returned API Key",
    },
    201: {
      content: {
        "application/json": {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
      description: "The API key is not yet ready",
    },
    500: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
      description: "Error when fetching the API Key with code",
    },
    ...authError,
  },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function generateRandomString(length: number) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export const registerGetAuthResponse = (app: App) => {
  return app.openapi(route, async (c) => {
    const { request_id } = c.req.valid("param");

    try {
      const result = await db.query.authRequestsTable.findFirst({
        where: eq(authRequestsTable.request_id, request_id),
      });

      if (result?.api_hash) {
        return c.json(
          {
            message: "Already used.",
          },
          {
            status: 201,
            headers: corsHeaders,
          },
        );
      }

      if (result && result.user_id) {
        const token = await generateToken(result.user_id, result.org_id);

        const hash = generateRandomString(64);

        const now = new Date();
        const expiryDate = new Date(now.getTime() + ms('30d'));

        await db
          .update(authRequestsTable)
          .set({
            api_hash: hash,
            expired_date: expiryDate,
          })
          .where(eq(authRequestsTable.request_id, request_id));

        const userName = await getOrgOrUserDisplayName(
          result.org_id,
          result.user_id,
        );

        return c.json(
          {
            api_key: token,
            name: userName,
          },
          {
            status: 200,
            headers: corsHeaders,
          },
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return c.json(
        {
          error: errorMessage,
        },
        {
          statusText: "Invalid request",
          status: 500,
          headers: corsHeaders,
        },
      );
    }
    return c.json(
      {
        message: "Not ready yet.",
      },
      {
        status: 201,
        headers: corsHeaders,
      },
    );
  });
};

const generateToken = async (userId: string, orgId?: string) => {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  const alg = 'HS256';

  const jwt = new SignJWT({
    user_id: userId,
    org_id: orgId,
  } as JWTPayload)
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime('30d');

  return await jwt.sign(secret);
};
