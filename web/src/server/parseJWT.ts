import { jwtVerify } from 'jose';

export interface JWTPayload {
  user_id: string;
  org_id?: string | null;
  exp?: number;
}

export async function parseJWT(token: string): Promise<JWTPayload | undefined> {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    return payload as JWTPayload;
  } catch (e) {
    return undefined;
  }
}
