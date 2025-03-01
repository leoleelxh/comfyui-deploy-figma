import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp"; // 需要安装: npm install sharp

const s3Client = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  region: "auto",
  credentials: {
    accessKeyId: process.env.SPACES_KEY || "",
    secretAccessKey: process.env.SPACES_SECRET || "",
  },
});

// 图片压缩函数 - 只压缩数据，不改变尺寸
async function compressImageIfNeeded(buffer: Buffer, mimeType: string): Promise<Buffer> {
  // 检查图片大小是否超过 1MB
  const sizeInMB = buffer.length / (1024 * 1024);
  
  // 如果小于 1MB，直接返回原图
  if (sizeInMB < 1) {
    return buffer;
  }
  
  console.log(`压缩前图片大小: ${sizeInMB.toFixed(2)}MB`);
  
  // 根据不同格式进行压缩，但不改变尺寸
  let sharpInstance = sharp(buffer);
  let compressedBuffer: Buffer;
  
  // 根据原始格式进行压缩
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    // 对于 JPEG，降低质量
    compressedBuffer = await sharpInstance.jpeg({ 
      quality: Math.max(60, Math.min(90, Math.floor(80 / sizeInMB))) 
    }).toBuffer();
  } else if (mimeType === 'image/png') {
    // 对于 PNG，增加压缩级别
    compressedBuffer = await sharpInstance.png({ 
      compressionLevel: 9,
      adaptiveFiltering: true
    }).toBuffer();
  } else if (mimeType === 'image/webp') {
    // 对于 WebP，降低质量
    compressedBuffer = await sharpInstance.webp({ 
      quality: Math.max(60, Math.min(90, Math.floor(80 / sizeInMB)))
    }).toBuffer();
  } else {
    // 默认转为 JPEG 格式
    compressedBuffer = await sharpInstance.jpeg({ 
      quality: Math.max(60, Math.min(90, Math.floor(80 / sizeInMB)))
    }).toBuffer();
  }
  
  const newSizeInMB = compressedBuffer.length / (1024 * 1024);
  console.log(`压缩后图片大小: ${newSizeInMB.toFixed(2)}MB`);
  
  // 如果压缩后仍然大于 1MB，进一步压缩
  if (newSizeInMB > 1) {
    return await compressImageIfNeeded(compressedBuffer, mimeType);
  }
  
  return compressedBuffer;
}

export async function uploadBase64Image(base64Data: string) {
  // 从 base64 中提取 MIME 类型和图片数据
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    // 保持原有的错误处理逻辑
    const base64Image = base64Data.split(';base64,').pop();
    if (!base64Image) throw new Error('Invalid base64 image data');
    
    const imageBuffer = Buffer.from(base64Image, 'base64');
    
    // 压缩图片
    const compressedBuffer = await compressImageIfNeeded(imageBuffer, 'image/png');
    
    const filename = `temp_${uuidv4()}.png`;
    
    // 上传到 R2
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: `uploads/${filename}`,
      Body: compressedBuffer,
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
  
  // 压缩图片
  const compressedBuffer = await compressImageIfNeeded(imageBuffer, mimeType);
  
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
    Body: compressedBuffer,
    ContentType: contentType,
    ACL: 'public-read',
  }));

  // 返回 CDN URL
  return `${process.env.SPACES_ENDPOINT_CDN}/uploads/${filename}`;
} 