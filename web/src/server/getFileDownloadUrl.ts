"use server";

import { replaceCDNUrl } from "./replaceCDNUrl";

export async function getFileDownloadUrl(file: string) {
  const CDN_ENDPOINT = process.env.SPACES_ENDPOINT_CDN;
  const BUCKET = process.env.SPACES_BUCKET;
  
  // 使用与 update-run 相同的 URL 格式
  return `${CDN_ENDPOINT}/${BUCKET}/${file}`;
}
