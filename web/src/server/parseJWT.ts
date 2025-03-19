import { APIKeyBodyRequest } from "@/server/APIKeyBodyRequest";
import { jwtVerify, createRemoteJWKSet } from 'jose';

export async function parseJWT(token: string) {
  try {
    // 根据环境判断是否使用 Node.js 原生模块或 Web API
    if (process.env.ENVIRONMENT === 'cloudflare') {
      // 使用 jose 库在 Edge 环境中验证 JWT
      const encoder = new TextEncoder();
      const secretKey = encoder.encode(process.env.JWT_SECRET!);
      
      const { payload } = await jwtVerify(token, secretKey);
      return APIKeyBodyRequest.parse(payload);
    } else {
      // 在 Node.js 环境中可以使用 jsonwebtoken
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET!);
      return APIKeyBodyRequest.parse(decoded);
    }
  } catch (err) {
    // 处理错误（令牌无效、过期等）
    console.error(err);
    return null;
  }
}
