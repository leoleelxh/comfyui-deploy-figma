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
  // 从 base64 中提取 MIME 类型和图片数据
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    // 保持原有的错误处理逻辑
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
  
  // 新的处理逻辑，保留原始格式
  const mimeType = matches[1];
  const base64Image = matches[2];
  const imageBuffer = Buffer.from(base64Image, 'base64');
  
  // 根据 MIME 类型确定文件扩展名
  let extension = 'png';
  let contentType = 'image/png';
  
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    extension = 'jpg';
    contentType = 'image/jpeg';
  } else if (mimeType === 'image/png') {
    extension = 'png';
    contentType = 'image/png';
  } else if (mimeType === 'image/webp') {
    extension = 'webp';
    contentType = 'image/webp';
  }
  
  const filename = `temp_${uuidv4()}.${extension}`;
  
  // 上传到 R2
  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.SPACES_BUCKET,
    Key: `uploads/${filename}`,
    Body: imageBuffer,
    ContentType: contentType,
    ACL: 'public-read',
  }));

  // 返回 CDN URL
  return `${process.env.SPACES_ENDPOINT_CDN}/uploads/${filename}`;
} 