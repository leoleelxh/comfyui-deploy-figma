"use server";

import { getMachineById } from "@/server/curdMachine";
import { auth } from "@clerk/nextjs";
import { SignJWT } from 'jose';
import { getOrgOrUserDisplayName } from "@/server/getOrgOrUserDisplayName";
import { withServerPromise } from "@/server/withServerPromise";
import "server-only";
import { headers } from "next/headers";
import { db } from "@/db/db";
import { workflowTable } from "@/db/schema";
import { eq } from "drizzle-orm";

export const editWorkflowOnMachine = withServerPromise(
  async (workflow_version_id: string, machine_id: string) => {
    const { userId, orgId } = auth();

    const headersList = headers();
    const host = headersList.get("host") || "";
    const protocol = headersList.get("x-forwarded-proto") || "";
    const domain = `${protocol}://${host}`;

    if (!userId) {
      throw new Error("No user id");
    }

    const machine = await getMachineById(machine_id);

    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const alg = 'HS256';

    const jwt = new SignJWT(orgId ? 
      { user_id: userId, org_id: orgId } : 
      { user_id: userId }
    )
      .setProtectedHeader({ alg })
      .setIssuedAt()
      .setExpirationTime('30d');

    const token = await jwt.sign(secret);

    const userName = await getOrgOrUserDisplayName(orgId, userId);

    let endpoint = machine.endpoint;

    if (machine.type === "comfy-deploy-serverless") {
      endpoint = machine.endpoint.replace("comfyui-api", "comfyui-app");
    }

    await db
      .update(workflowTable)
      .set({
        machine_id: machine_id,
        updated_at: new Date(),
      })
      .where(eq(workflowTable.id, workflow_version_id));

    return `${endpoint}?workflow_version_id=${encodeURIComponent(
      workflow_version_id,
    )}&auth_token=${encodeURIComponent(token)}&org_display=${encodeURIComponent(
      userName,
    )}&origin=${encodeURIComponent(domain)}`;
  },
);
