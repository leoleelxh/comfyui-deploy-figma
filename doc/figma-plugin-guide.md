# Figma 插件与 ComfyUI Deploy 集成指南

本文档提供了关于如何在 Figma 插件中与 ComfyUI Deploy 服务进行交互的详细指南，特别是关于优化后的图片处理流程和新增的数据清理 API。

## 目录

1. [API 端点概览](#api端点概览)
2. [身份验证](#身份验证)
3. [图片处理优化流程](#图片处理优化流程)
4. [使用预签名 URL 上传图片](#使用预签名url上传图片)
5. [创建和运行工作流](#创建和运行工作流)
6. [查询运行状态](#查询运行状态)
7. [清理图片数据](#清理图片数据)
8. [错误处理](#错误处理)
9. [完整示例](#完整示例)

## API 端点概览

ComfyUI Deploy 服务提供以下关键 API 端点：

| 端点                            | 方法 | 描述                                    |
| ------------------------------- | ---- | --------------------------------------- |
| `/api/get-presigned-upload-url` | POST | 获取预签名 URL 用于直接上传图片到 R2/S3 |
| `/api/create-run`               | POST | 创建并执行工作流                        |
| `/api/status/{run_id}`          | GET  | 获取工作流运行状态                      |
| `/api/cleanup-run-data`         | POST | 清理运行记录中的图片数据                |

## 身份验证

### JWT Token Authentication

The Figma plugin uses JWT token authentication for API access. This ensures secure communication between the plugin and the backend services.

#### Token Usage

1. Obtain a JWT token from the web application
2. Include the token in all API requests:

```typescript
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};
```

#### API Endpoints

The following endpoints require JWT token authentication:

1. Get Pre-signed Upload URL

```typescript
// Request
const response = await fetch("/api/get-presigned-upload-url", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    fileType: "image/png",
  }),
});

// Response
{
  presignedUrl: string; // URL for uploading the file
  cdnUrl: string; // URL where the file will be accessible after upload
  key: string; // File key in the storage
  fileType: string; // MIME type of the file
  extension: string; // File extension
}
```

2. Other endpoints...

#### Error Handling

The API returns standard HTTP status codes:

- 401 Unauthorized: Invalid or missing token
- 403 Forbidden: Token revoked or insufficient permissions
- 500 Internal Server Error: Server-side error

Error response format:

```typescript
{
  error: string;        // Error message
  details?: string;     // Additional error details (if available)
}
```

## 图片处理优化流程

新的图片处理流程大幅减少了数据传输量和存储压力，流程如下：

1. 获取预签名 URL
2. 直接将图片上传到 R2/S3
3. 使用图片 URL 创建工作流
4. 完成后，调用清理 API 移除不必要的数据

这种方法相比于旧的 Base64 传输方式，可以将 API 请求体积减少约 99.9%，显著提高效率。

## 使用预签名 URL 上传图片

### 步骤 1：获取预签名 URL

```typescript
async function getPresignedUrl(imageType: string, extension: string) {
  const response = await fetch(
    "https://your-deploy-url.com/api/get-presigned-upload-url",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        fileType: imageType, // 例如 "image/png"
        extension: extension, // 例如 "png"
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`获取预签名URL失败: ${data.error || response.statusText}`);
  }

  return {
    presignedUrl: data.presignedUrl, // 用于上传的URL
    cdnUrl: data.cdnUrl, // 上传后可访问的URL
    key: data.key, // 存储的文件标识符
  };
}
```

### 步骤 2：上传图片到存储

```typescript
async function uploadImageToStorage(imageBlob: Blob, presignedUrl: string) {
  const response = await fetch(presignedUrl, {
    method: "PUT",
    body: imageBlob,
    headers: {
      "Content-Type": imageBlob.type,
    },
  });

  if (!response.ok) {
    throw new Error(`上传图片失败: ${response.statusText}`);
  }

  return true;
}
```

### 步骤 3：从 Figma 获取图片并上传

```typescript
async function uploadFigmaSelection() {
  // 获取Figma选中的节点
  const selection = figma.currentPage.selection;
  if (!selection.length) {
    figma.notify("请先选择要处理的元素");
    return;
  }

  try {
    // 将Figma节点导出为PNG
    const bytes = await selection[0].exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: 2 },
    });

    // 创建Blob对象
    const imageBlob = new Blob([bytes], { type: "image/png" });

    // 获取预签名URL
    const { presignedUrl, cdnUrl } = await getPresignedUrl("image/png", "png");

    // 上传图片
    await uploadImageToStorage(imageBlob, presignedUrl);

    // 返回可访问的URL
    return cdnUrl;
  } catch (error) {
    figma.notify(`上传失败: ${error.message}`);
    console.error("上传错误:", error);
  }
}
```

## 创建和运行工作流

使用获取到的图片 URL 创建工作流运行：

```typescript
async function createWorkflowRun(workflowId: string, imageUrl: string) {
  const response = await fetch("https://your-deploy-url.com/api/create-run", {
    method: "POST",
    headers,
    body: JSON.stringify({
      workflow_id: workflowId,
      inputs: {
        // 使用URL而不是base64数据
        ComfyUIDeployExternalImage: imageUrl,
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`创建工作流运行失败: ${data.error || response.statusText}`);
  }

  return data.run_id;
}
```

## 查询运行状态

定期查询工作流运行状态：

```typescript
async function pollRunStatus(runId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(
          `https://your-deploy-url.com/api/status/${runId}`,
          {
            method: "GET",
            headers,
          }
        );

        const data = await response.json();

        if (!response.ok) {
          reject(
            new Error(`查询状态失败: ${data.error || response.statusText}`)
          );
          return;
        }

        // 检查状态
        if (data.status === "success") {
          resolve(data);
        } else if (data.status === "failed") {
          reject(new Error(`工作流执行失败: ${data.error || "未知错误"}`));
        } else {
          // 继续轮询
          setTimeout(checkStatus, 1000);
        }
      } catch (error) {
        reject(error);
      }
    };

    // 开始检查
    checkStatus();
  });
}
```

## 清理图片数据

工作流完成并处理结果后，调用清理 API 移除不必要的图片数据：

```typescript
async function cleanupRunData(runId: string, delaySeconds = 60) {
  try {
    const response = await fetch(
      "https://your-deploy-url.com/api/cleanup-run-data",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          run_id: runId,
          delay_seconds: delaySeconds, // 延迟时间，单位为秒
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(`清理数据请求失败: ${data.error || response.statusText}`);
      return false;
    }

    console.log(`清理任务已安排: ${data.message}`);
    return true;
  } catch (error) {
    console.error("清理数据出错:", error);
    return false;
  }
}
```

## 错误处理

在插件中实现统一的错误处理：

```typescript
function handleApiError(error: Error, context: string) {
  console.error(`${context} 错误:`, error);

  // 显示友好的错误信息
  figma.notify(`操作失败: ${error.message}`, { timeout: 5000, error: true });

  // 可以添加错误报告功能
  // reportErrorToAnalytics(error, context);
}
```

## 完整示例

下面是一个完整的工作流程示例，演示了从 Figma 导出图片、上传、处理到清理的完整周期：

```typescript
// main.ts - Figma插件主文件

import {
  getPresignedUrl,
  uploadImageToStorage,
  createWorkflowRun,
  pollRunStatus,
  cleanupRunData,
} from "./api";

// 插件初始化
figma.showUI(__html__, { width: 300, height: 400 });

// 处理UI发送的消息
figma.ui.onmessage = async (msg) => {
  if (msg.type === "process-image") {
    try {
      figma.notify("开始处理图片...", { timeout: 2000 });

      // 1. 导出选中的Figma节点
      const selection = figma.currentPage.selection;
      if (!selection.length) {
        figma.notify("请先选择要处理的元素", { error: true });
        return;
      }

      const bytes = await selection[0].exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: 2 },
      });

      // 2. 获取预签名URL
      figma.notify("获取上传URL...");
      const { presignedUrl, cdnUrl } = await getPresignedUrl(
        "image/png",
        "png"
      );

      // 3. 上传图片
      figma.notify("上传图片到存储...");
      const imageBlob = new Blob([bytes], { type: "image/png" });
      await uploadImageToStorage(imageBlob, presignedUrl);

      // 4. 创建工作流运行
      figma.notify("创建工作流...");
      const workflowId = msg.workflowId;
      const runId = await createWorkflowRun(workflowId, cdnUrl);

      // 5. 轮询状态
      figma.notify("处理中...请等待");
      const result = await pollRunStatus(runId);

      // 6. 处理结果
      figma.notify("处理完成！正在导入结果...");

      // 7. 使用结果（例如，将生成的图像导入Figma）
      if (result.images && result.images.length > 0) {
        const imageUrl = result.images[0].url;

        // 通知UI导入图片
        figma.ui.postMessage({
          type: "import-result",
          imageUrl,
        });

        // 8. 清理数据（在成功处理结果后）
        cleanupRunData(runId, 60); // 60秒后清理
      }
    } catch (error) {
      figma.notify(`处理失败: ${error.message}`, { error: true });
      console.error("处理错误:", error);
    }
  }
};
```

### UI 部分示例 (HTML/JS)

```html
<div id="app">
  <h2>ComfyUI Deploy</h2>
  <div class="input-group">
    <label>选择工作流:</label>
    <select id="workflow-select">
      <!-- 工作流选项将动态加载 -->
    </select>
  </div>

  <button id="process-btn" class="primary-btn">处理选中图像</button>

  <div id="result" class="result-container" style="display:none;">
    <h3>处理结果:</h3>
    <img id="result-img" src="" />
    <button id="import-btn" class="secondary-btn">导入到Figma</button>
  </div>
</div>

<script>
  // UI侧代码
  document.getElementById("process-btn").onclick = () => {
    const workflowId = document.getElementById("workflow-select").value;
    parent.postMessage(
      {
        pluginMessage: {
          type: "process-image",
          workflowId,
        },
      },
      "*"
    );
  };

  // 接收插件发来的消息
  window.onmessage = (event) => {
    const message = event.data.pluginMessage;
    if (!message) return;

    if (message.type === "import-result") {
      // 显示结果
      document.getElementById("result").style.display = "block";
      document.getElementById("result-img").src = message.imageUrl;

      // 设置导入按钮事件
      document.getElementById("import-btn").onclick = () => {
        parent.postMessage(
          {
            pluginMessage: {
              type: "import-to-figma",
              imageUrl: message.imageUrl,
            },
          },
          "*"
        );
      };
    }
  };
</script>
```

## 最佳实践

1. **错误重试**：实现指数退避重试机制，处理临时网络问题
2. **取消操作**：允许用户取消长时间运行的操作
3. **状态缓存**：在插件中缓存最近的运行状态，避免频繁请求
4. **批量处理**：实现批量图片处理功能，优化用户体验
5. **离线支持**：当可能时，提供基本的离线功能
6. **进度显示**：实现详细的进度显示，提高用户体验
7. **存储管理**：提供操作历史和结果管理功能

## 测试与调试

1. **使用 Figma 插件开发模式**进行测试
2. **启用调试日志**记录 API 请求和响应
3. **创建模拟服务器**进行本地测试
4. **使用 Figma 的 console.log**查看错误和状态
5. **利用浏览器开发工具**检查网络请求

---

如有任何问题或需要进一步说明，请联系 ComfyUI Deploy 团队。
