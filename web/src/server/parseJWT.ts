import { APIKeyBodyRequest } from "@/server/APIKeyBodyRequest";
import { jwtVerify } from 'jose';

export async function parseJWT(token: string) {
  try {
    // 根据环境判断是否使用 Edge 兼容的jwt验证或 Node.js 原生的jsonwebtoken
    if (process.env.ENVIRONMENT === 'cloudflare') {
      // 使用 jose 库在 Edge 环境中验证 JWT
      const encoder = new TextEncoder();
      const secretKey = encoder.encode(process.env.JWT_SECRET!);
      
      const { payload } = await jwtVerify(token, secretKey);
      return APIKeyBodyRequest.parse(payload);
    } else {
      // 在 Node.js 环境下，确保正确导入jsonwebtoken
      // 使用动态导入，避免在Edge环境中加载此库
      const jwt = await import('jsonwebtoken').then(module => module.default || module);
      const decoded = jwt.verify(token, process.env.JWT_SECRET!);
      return APIKeyBodyRequest.parse(decoded);
    }
  } catch (err) {
    // 处理错误（令牌无效、过期等）
    console.error('JWT验证错误:', err);
    return null;
  }
}
