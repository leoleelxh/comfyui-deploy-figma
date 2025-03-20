/**
 * 工具函数：验证输入是否是有效的图像URL
 * 支持自托管R2/S3 URL和外部URL
 */
export function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // 基本URL格式验证
  try {
    new URL(url);
  } catch {
    return false;
  }

  // 检查是否是常见的图像URL格式
  const isCommonImageUrl = /\.(jpeg|jpg|png|gif|webp|bmp|tiff|avif|heic)($|\?)/i.test(url);
  
  // 检查是否是我们自己的R2/S3 URL
  const isSelfHostedUrl = [
    process.env.SPACES_ENDPOINT_CDN,
    process.env.SPACES_ENDPOINT,
    'r2.dev',
    's3.amazonaws',
    'cloudflare-ipfs'
  ].some(domain => url.includes(domain || ''));

  // 判断为图像URL的条件：
  // 1. 是常见图像URL格式
  // 2. 是我们自己的R2/S3 URL，假定这些是有效的
  return isCommonImageUrl || isSelfHostedUrl;
} 