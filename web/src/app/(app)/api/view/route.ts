import { getFileDownloadUrl } from "../../../../server/getFileDownloadUrl";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = process.env.ENVIRONMENT === "cloudflare" ? "edge" : "nodejs";
export const preferredRegion = "auto";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const file = new URL(request.url).searchParams.get("file");
  if (!file) return NextResponse.redirect("/");
  return NextResponse.redirect(await getFileDownloadUrl(file));
}
