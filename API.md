# ComfyUI Deploy API Documentation

## Authentication

所有 API 请求需要在 header 中携带 Bearer Token:

```typescript
headers: {
  'Authorization': 'Bearer YOUR_API_TOKEN',
  'Content-Type': 'application/json'
}
```

## Base URL

```
http://localhost:3000/api  // 本地开发
https://your-domain.com/api  // 生产环境
```

## API Endpoints

### 1. 获取部署列表

获取当前用户可用的所有部署。

```typescript
GET /deployments

Response 200:
{
  deployments: [{
    id: string;
    name: string;
    version: number;
    status: "active" | "archived";
    created_at: string;
    updated_at: string;
  }]
}
```

### 2. 创建运行实例

使用指定的部署创建一个新的运行实例。

```typescript
POST /run

Request Body:
{
  deployment_id: string;
  inputs: {
    // 根据工作流定义的输入参数
    text_input?: string;
    image_input?: string;
    number_input?: number;
    // ...其他输入
  }
}

Response 200:
{
  run_id: string;
}
```

### 3. 获取运行状态

获取运行实例的当前状态和输出。

```typescript
GET /status/{run_id}

Response 200:
{
  id: string;
  status: "not-started" | "running" | "uploading" | "success" | "failed";
  started_at: string;
  ended_at: string | null;
  duration: number | null;  // 运行时长(秒)
  outputs: [{
    images: [{
      url: string;         // 完整的 CDN URL
      type: "output";
      filename: string;
      subfolder: string;
      upload_duration: number;
    }],
    created_at: string;
  }],
  error?: string;         // 仅在 status="failed" 时存在
  progress: {
    current: number;      // 0-100
    total: number;        // 100
    message: string;      // 进度描述
  }
}
```

## 使用示例

### TypeScript/JavaScript

```typescript
import axios from "axios";

const API_BASE = "http://localhost:3000/api";
const API_TOKEN = "your_api_token";

const headers = {
  Authorization: `Bearer ${API_TOKEN}`,
  "Content-Type": "application/json",
};

// 1. 获取部署列表
const deploymentsResponse = await axios.get(`${API_BASE}/deployments`, {
  headers,
});
const deployment_id = deploymentsResponse.data[0].id;

// 2. 创建运行
const runResponse = await axios.post(
  `${API_BASE}/run`,
  {
    deployment_id,
    inputs: {
      text_input: "a photo of a cat",
    },
  },
  { headers }
);

// 3. 轮询运行状态
async function pollRunStatus(run_id: string) {
  while (true) {
    const { data } = await axios.get(`${API_BASE}/status/${run_id}`, {
      headers,
    });

    if (data.status === "success") {
      return data;
    }

    if (data.status === "failed") {
      throw new Error(data.error);
    }

    // 等待 2 秒后重试
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

const result = await pollRunStatus(runResponse.data.run_id);
console.log("Generated images:", result.outputs[0].images);
```

### Python

```python
import requests
import time

API_BASE = "http://localhost:3000/api"
API_TOKEN = "your_api_token"

headers = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json"
}

# 1. 获取部署列表
deployments = requests.get(
    f"{API_BASE}/deployments",
    headers=headers
).json()

deployment_id = deployments[0]["id"]

# 2. 创建运行
run_response = requests.post(
    f"{API_BASE}/run",
    headers=headers,
    json={
        "deployment_id": deployment_id,
        "inputs": {
            "text_input": "a photo of a cat"
        }
    }
).json()

# 3. 轮询运行状态
def poll_run_status(run_id):
    while True:
        response = requests.get(
            f"{API_BASE}/status/{run_id}",
            headers=headers
        ).json()

        if response["status"] == "success":
            return response

        if response["status"] == "failed":
            raise Exception(response["error"])

        time.sleep(2)

result = poll_run_status(run_response["run_id"])
print("Generated images:", result["outputs"][0]["images"])
```

## 错误处理

API 可能返回以下 HTTP 状态码：

- 200: 请求成功
- 400: 请求参数错误
- 401: 认证失败
- 403: 权限不足
- 404: 资源不存在
- 500: 服务器内部错误

错误响应格式：

```typescript
{
  error: string; // 错误描述
}
```
