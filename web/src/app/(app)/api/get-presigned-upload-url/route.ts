import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { auth } from "@clerk/nextjs";
import { parseJWT } from "@/server/parseJWT";
import { isKeyRevoked } from "@/server/curdApiKeys";

// 根据环境变量使用不同的运行时
export const runtime = process.env.ENVIRONMENT === "cloudflare" ? "edge" : "nodejs";
export const preferredRegion = "auto";
export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// 初始化S3客户端
const s3Client = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  region: process.env.SPACES_REGION || "auto",
  credentials: {
    accessKeyId: process.env.SPACES_KEY || "",
    secretAccessKey: process.env.SPACES_SECRET || "",
  },
  forcePathStyle: process.env.SPACES_CDN_FORCE_PATH_STYLE === "true",
});

export async function POST(request: Request) {
  try {
    // 身份验证
    const { userId } = auth();
    const token = request.headers.get("Authorization")?.split(" ")?.[1];
    
    // 如果没有 token，检查 Clerk auth
    if (!token) {
      if (!userId && !process.env.DISABLE_AUTH) {
        return NextResponse.json({ error: "Unauthorized" }, { 
          status: 401,
          headers: corsHeaders
        });
      }
    } else {
      // 验证 JWT token
      const userData = token ? parseJWT(token) : undefined;
      if (!userData || token === undefined) {
        return NextResponse.json({ error: "Invalid or expired token" }, {
          status: 401,
          headers: corsHeaders
        });
      }

      // 如果 token 没有过期时间，检查是否被撤销
      if (userData.exp === undefined) {
        const revokedKey = await isKeyRevoked(token);
        if (revokedKey) {
          return NextResponse.json({ error: "Revoked token" }, {
            status: 401,
            headers: corsHeaders
          });
        }
      }
    }

    // 获取请求参数
    const data = await request.json().catch(() => ({}));
    const fileType = data.fileType || "image/png";
    const extension = getExtensionFromMimeType(fileType);
    
    // 生成唯一文件名
    const filename = `temp_${uuidv4()}.${extension}`;
    const key = `uploads/${filename}`;

    // 创建预签名URL，有效期10分钟
    const command = new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: key,
      ContentType: fileType,
      ACL: 'public-read',
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 });
    
    // 构建最终的CDN URL
    const cdnUrl = process.env.SPACES_CDN_FORCE_PATH_STYLE === "true"
      ? `${process.env.SPACES_ENDPOINT_CDN}/${process.env.SPACES_BUCKET}/${key}`
      : `${process.env.SPACES_ENDPOINT_CDN}/${key}`;
    
    return NextResponse.json({
      presignedUrl,
      cdnUrl,
      key,
      fileType,
      extension
    }, {
      headers: corsHeaders
    });
  } catch (error: any) {
    console.error("Error generating presigned URL:", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL", details: error.message },
      { 
        status: 500,
        headers: corsHeaders
      }
    );
  }
}

// 辅助函数：从MIME类型获取文件扩展名
function getExtensionFromMimeType(mimeType: string): string {
  const mimeTypeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'image/svg+xml': 'svg'
  };
  
  return mimeTypeMap[mimeType] || 'png'; // 默认为png
} 