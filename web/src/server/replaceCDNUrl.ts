export function replaceCDNUrl(url: string) {
  // When using R2, we don't want to include the bucket name in the URL
  if (process.env.SPACES_CDN_DONT_INCLUDE_BUCKET === "true") {
    url = url.replace(
      `${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET}`,
      process.env.SPACES_ENDPOINT_CDN!
    );
    // When using digital ocean, we need to use the bucket name in the URL
  } else if (process.env.SPACES_CDN_FORCE_PATH_STYLE === "false") {
    const cdnUrl = new URL(process.env.SPACES_ENDPOINT_CDN!);
    url = url.replace(
      `${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET}`,
      `${cdnUrl.protocol}//${process.env.SPACES_BUCKET}.${cdnUrl.host}`
    );
  } else {
    // 修改这里：先替换完整路径，再替换端点
    // 这样可以处理两种情况：带bucket和不带bucket的URL
    url = url.replace(
      `${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET}/comfyui-deploy`,
      `${process.env.SPACES_ENDPOINT_CDN}`
    );
    
    // 如果上面的替换没有生效，再尝试只替换端点
    url = url.replace(
      process.env.SPACES_ENDPOINT!,
      process.env.SPACES_ENDPOINT_CDN!
    );
  }
  return url;
}
