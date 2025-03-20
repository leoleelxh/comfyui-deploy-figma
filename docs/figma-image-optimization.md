# Figma 插件图像处理优化指南

本文档提供了如何优化 Figma 插件与 ComfyUI Deploy 之间的图像处理流程的详细指南，特别是通过直接上传到 R2/S3 存储来减少数据库负载和传输量。

## 当前问题

在优化前的流程中，Figma 插件会将图像作为 base64 编码字符串发送到 API，这会导致以下问题：

1. **大型请求体**：base64 编码会使数据大小增加约 33%
2. **API 超时风险**：处理大型请求可能导致 API 超时
3. **服务器内存压力**：解码大型 base64 字符串占用大量内存
4. **处理开销**：服务器需要解码、压缩和上传图像

## 优化方案

新方案通过以下步骤优化流程：

1. Figma 插件先调用预签名 URL API 获取上传凭证
2. 插件直接上传图像到 R2/S3 存储
3. 插件使用返回的 CDN URL 替代 base64 数据调用 API

这种方法的优势：

- 减少 API 请求体积（从 MB 级别降至 KB 级别）
- 降低服务器处理负担
- 减少 API 超时风险
- 提高并发处理能力

## 技术实现

### 1. 服务端实现

我们已经添加了以下内容到服务端：

1. **预签名 URL API**：

   ```
   POST /api/get-presigned-upload-url
   ```

   该 API 返回：

   ```json
   {
     "presignedUrl": "https://...", // 用于上传的临时URL
     "cdnUrl": "https://...", // 上传成功后可访问的最终URL
     "key": "uploads/temp_xxx.jpg", // 存储路径
     "fileType": "image/jpeg", // 文件类型
     "extension": "jpg" // 文件扩展名
   }
   ```

2. **URL 处理逻辑**：
   服务端 API 现在可以识别和处理图像 URL，无需再将 base64 转换为 URL。

### 2. Figma 插件实现

Figma 插件需要实现以下功能：

```javascript
// 1. 上传图像
async function uploadImage(imageData) {
  try {
    // 获取预签名URL
    const response = await fetch(
      "https://your-domain.com/api/get-presigned-upload-url",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileType: "image/png", // 或根据实际图像类型
        }),
      }
    );

    if (!response.ok) {
      throw new Error("获取上传URL失败");
    }

    const { presignedUrl, cdnUrl } = await response.json();

    // 准备图像数据
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = atob(base64Data);
    const array = new Uint8Array(binaryData.length);

    for (let i = 0; i < binaryData.length; i++) {
      array[i] = binaryData.charCodeAt(i);
    }

    const blob = new Blob([array], { type: "image/png" });

    // 上传到R2/S3
    await fetch(presignedUrl, {
      method: "PUT",
      body: blob,
      headers: {
        "Content-Type": "image/png",
      },
    });

    // 返回CDN URL
    return cdnUrl;
  } catch (error) {
    console.error("图像上传失败:", error);
    // 出错时返回原始base64以保证向后兼容
    return imageData;
  }
}

// 2. 使用示例
async function processSelection() {
  // 获取Figma选中元素的图像
  const imageData = await getImageFromSelection();

  // 上传图像并获取URL
  const imageUrl = await uploadImage(imageData);

  // 调用ComfyUI Deploy API
  const apiResponse = await fetch("https://your-domain.com/api/run", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      deployment_id: selectedDeploymentId,
      inputs: {
        image_input: imageUrl, // 使用URL而不是base64
      },
    }),
  });

  // 处理响应...
}
```

## 实施注意事项

1. **错误处理**：

   - 实现回退机制，当直接上传失败时使用原始 base64 方法
   - 添加重试逻辑处理临时网络问题

2. **图像尺寸优化**：

   - 在 Figma 插件中添加基本的图像预处理（调整尺寸）
   - 使用合理的图像格式（如 JPEG 代替 PNG）以减小文件大小

3. **安全考虑**：
   - 预签名 URL 是临时的，且仅允许特定操作
   - 实施适当的认证以防止滥用 API

## 性能比较

| 指标           | 优化前 | 优化后 | 改进     |
| -------------- | ------ | ------ | -------- |
| API 请求体积   | ~1MB+  | ~1KB   | 99.9%+   |
| 服务器内存使用 | 高     | 低     | 显著降低 |
| 处理时间       | 较长   | 较短   | 50-80%   |
| 并发支持       | 有限   | 更高   | 显著提升 |

## 总结

通过实施直接上传到 R2/S3 的方案，我们能显著减少数据传输量、降低服务器负载，并提高整体系统性能。这种方法特别适合处理大型图像文件的场景，能够更好地支持大规模用户并发使用。
