import { jwtVerify, createRemoteJWKSet } from 'jose';

export async function parseJWT(token: string) {
  try {
    const JWKS = createRemoteJWKSet(new URL(process.env.CLERK_JWKS_URL!))
    
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.CLERK_ISSUER,
      audience: process.env.CLERK_AUDIENCE,
    })
    
    return payload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return undefined;
  }
}
