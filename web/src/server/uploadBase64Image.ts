import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

const s3Client = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  region: "auto",
  credentials: {
    accessKeyId: process.env.SPACES_KEY || "",
    secretAccessKey: process.env.SPACES_SECRET || "",
  },
});

export async function uploadBase64Image(base64Data: string) {
  // 从 base64 中提取实际的图片数据
  const base64Image = base64Data.split(';base64,').pop();
  if (!base64Image) throw new Error('Invalid base64 image data');
  
  const imageBuffer = Buffer.from(base64Image, 'base64');
  const filename = `temp_${uuidv4()}.png`;
  
  // 上传到 R2
  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.SPACES_BUCKET,
    Key: `uploads/${filename}`,
    Body: imageBuffer,
    ContentType: 'image/png',
    ACL: 'public-read',
  }));

  // 返回 CDN URL
  return `${process.env.SPACES_ENDPOINT_CDN}/uploads/${filename}`;
} 