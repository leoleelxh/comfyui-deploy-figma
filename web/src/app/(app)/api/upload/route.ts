import { snapshotType, workflowAPIType, workflowType } from "@/db/schema";
import { parseDataSafe } from "@/lib/parseDataSafe";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createNewWorkflow,
  createNewWorkflowVersion,
} from "../../../../server/createNewWorkflow";
import { parseJWT, JWTPayload } from "@/server/parseJWT";
import { NextRequest } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// This is will be deprecated

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const UploadRequest = z.object({
  workflow_id: z.string().optional(),
  workflow_name: z.string().min(1).optional(),
  workflow: workflowType,
  workflow_api: workflowAPIType,
  snapshot: snapshotType,
});

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return new NextResponse("No token", { status: 401 });
  }

  const userData = await parseJWT(token);

  if (!userData) {
    return new NextResponse("Invalid token", { status: 401 });
  }

  const { user_id, org_id } = userData as JWTPayload;

  if (!user_id) return new NextResponse("Invalid user_id", { status: 401 });

  const [data, error] = await parseDataSafe(
    UploadRequest,
    req,
    corsHeaders,
  );

  if (!data || error) return error;

  const {
    // user_id,
    workflow,
    workflow_api,
    workflow_id: _workflow_id,
    workflow_name,
    snapshot,
  } = data;

  let workflow_id = _workflow_id;

  let version = -1;

  // Case 1 new workflow
  try {
    if ((!workflow_id || workflow_id.length === 0) && workflow_name) {
      // Create a new parent workflow
      const { workflow_id: _workflow_id, version: _version } =
        await createNewWorkflow({
          user_id: user_id,
          org_id: org_id,
          workflow_name: workflow_name,
          workflowData: {
            workflow,
            workflow_api,
            snapshot,
          },
        });

      workflow_id = _workflow_id;
      version = _version;
    } else if (workflow_id) {
      // Case 2 update workflow
      const { version: _version } = await createNewWorkflowVersion({
        workflow_id: workflow_id,
        workflowData: {
          workflow,
          workflow_api,
          snapshot,
        },
      });
      version = _version;
    } else {
      return NextResponse.json(
        {
          error: "Invalid request, missing either workflow_id or name",
        },
        {
          status: 500,
          statusText: "Invalid request",
          headers: corsHeaders,
        },
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.toString(),
      },
      {
        status: 500,
        statusText: "Invalid request",
        headers: corsHeaders,
      },
    );
  }

  return NextResponse.json(
    {
      workflow_id: workflow_id,
      version: version,
    },
    {
      status: 200,
      headers: corsHeaders,
    },
  );
}
