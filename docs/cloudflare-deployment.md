# Cloudflare Pages 部署指南

本文档提供了将 ComfyUI Deploy Figma 应用部署到 Cloudflare Pages 的详细步骤。

## 准备工作

1. **Cloudflare 账户**：确保您有一个 Cloudflare 账户并已登录。
2. **GitHub 仓库**：确保您的项目代码已推送到 GitHub 仓库。
3. **环境变量**：准备好所有必要的环境变量，包括数据库连接信息、认证密钥等。

## 部署步骤

### 1. 配置 Cloudflare Pages 项目

1. 登录 Cloudflare 控制台。
2. 导航到 **Pages** 部分。
3. 点击 **创建一个项目**。
4. 选择 **连接到 Git**。
5. 选择您的 GitHub 账户并授权 Cloudflare 访问。
6. 选择包含 ComfyUI Deploy Figma 应用的仓库。
7. 配置构建设置：
   - **项目名称**：`comfyui-deploy-figma`（或您喜欢的名称）
   - **生产分支**：`main`（或您的主分支）
   - **构建命令**：`cd web && npm install && npm run build`
   - **构建输出目录**：`web/.vercel/output/static`
   - **根目录**：留空（默认为仓库根目录）

### 2. 配置环境变量

在 Cloudflare Pages 项目设置中，添加以下环境变量：

```
ENVIRONMENT=cloudflare
POSTGRES_URL=您的数据库连接URL
POSTGRES_SSL=true
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=您的Clerk公钥
CLERK_SECRET_KEY=您的Clerk密钥
SPACES_ENDPOINT=您的存储端点
SPACES_ENDPOINT_CDN=您的CDN端点
SPACES_REGION=您的存储区域
SPACES_BUCKET=您的存储桶名称
SPACES_KEY=您的存储访问密钥
SPACES_SECRET=您的存储秘密密钥
SPACES_CDN_DONT_INCLUDE_BUCKET=true/false
SPACES_CDN_FORCE_PATH_STYLE=true/false
JWT_SECRET=您的JWT密钥
NEXT_PUBLIC_POSTHOG_KEY=您的PostHog密钥
NEXT_PUBLIC_POSTHOG_HOST=您的PostHog主机
COMFYUI_BACKEND_URL=您的后端服务URL
```

### 3. 部署项目

1. 点击 **保存并部署**。
2. Cloudflare Pages 将开始构建和部署您的应用。
3. 构建完成后，您将获得一个 `*.pages.dev` 域名，可用于访问您的应用。

### 4. 自定义域名设置（可选）

如果您想使用自定义域名：

1. 在项目的 **自定义域** 部分，点击 **设置自定义域**。
2. 输入您想使用的域名。
3. 按照 Cloudflare 提供的说明进行 DNS 配置。

## 特殊注意事项

### Edge Runtime 兼容性

部署到 Cloudflare Pages 时，应用会在 Edge Runtime 中运行。以下功能已经适配：

1. **API 路由**：所有 API 路由都标记为了 Edge 兼容。
2. **JWT 验证**：使用 `jose` 库代替 `jsonwebtoken` 进行 JWT 验证。
3. **数据库连接**：已适配 Cloudflare Workers 环境。

### 部署后验证

部署完成后，请验证以下功能是否正常工作：

1. **认证流程**：确保用户可以正常登录和注册。
2. **工作流创建和运行**：测试工作流的创建和执行。
3. **文件上传和存储**：测试文件上传和访问功能。
4. **API 端点**：测试所有 API 端点是否正常响应。

## 故障排除

如果部署后遇到问题：

1. **检查日志**：在 Cloudflare Pages 控制台查看构建和运行时日志。
2. **环境变量**：确保所有环境变量都已正确设置。
3. **路由问题**：确保所有 API 路由都正确标记了 Edge 运行时。
4. **数据库连接**：验证数据库连接字符串和授权信息是否正确。

## 升级和更新

当您需要更新应用时：

1. 将更改推送到连接的 GitHub 仓库。
2. Cloudflare Pages 会自动检测更改并重新部署。
3. 如果需要，您可以在 Cloudflare Pages 控制台手动触发部署。

## 回滚部署

如果需要回滚到先前的部署：

1. 在 Cloudflare Pages 控制台导航到您的项目。
2. 转到 **部署** 选项卡。
3. 找到您想回滚到的部署版本。
4. 点击 **重新部署** 或 **回滚到此版本**。

## 本地开发

### 使用 Node.js 18 进行开发

如果你使用的是 NVM，可以通过以下命令切换 Node.js 版本：

```bash
# 安装 Node.js 18（如果尚未安装）
nvm install 18

# 切换到 Node.js 18
nvm use 18
```

### 启动本地 LocalStack

LocalStack 提供了 S3/R2 存储的本地模拟：

```bash
# 使用 Docker 启动 LocalStack
docker run -d -p 4566:4566 -e SERVICES=s3 --name localstack localstack/localstack

# 创建存储桶
aws --endpoint-url=http://localhost:4566 s3 mb s3://comfyui-deploy

# 设置公共访问权限
aws --endpoint-url=http://localhost:4566 s3api put-bucket-policy --bucket comfyui-deploy --policy '{"Version":"2012-10-17","Statement":[{"Sid":"PublicRead","Effect":"Allow","Principal":"*","Action":"s3:GetObject","Resource":"arn:aws:s3:::comfyui-deploy/*"}]}'
```

### 本地 Cloudflare Pages 开发

项目提供了几个简便的脚本来启动 Cloudflare Pages 开发环境：

```bash
# 进入 web 目录
cd web

# 安装依赖
npm install

# 启动 Cloudflare Pages 开发环境
npm run cloudflare:start

# 启动带详细日志的开发环境
npm run cloudflare:verbose
```

如果遇到端口冲突，可以在 `package.json` 中修改端口：

```json
"pages:dev": "wrangler pages dev .vercel/output/static --compatibility-date=2023-05-10 --compatibility-flag=nodejs_compat --port 3333"
```

## 本地和 Cloudflare 环境切换

项目使用 `process.env.ENVIRONMENT === 'cloudflare'` 条件来检测当前环境，并相应地调整行为。这确保了在本地开发和 Cloudflare 部署之间的无缝切换。

### 主要差异处理

1. **JWT 验证**：

   - 本地：使用 jsonwebtoken 库
   - Cloudflare：使用 jose 库

2. **数据库连接**：

   - 本地：连接到本地或 Neon PostgreSQL
   - Cloudflare：连接到远程 PostgreSQL 或 D1

3. **存储配置**：
   - 本地：使用 LocalStack
   - Cloudflare：使用 R2 存储

## 回滚方案

如需回滚到 Vercel 部署：

1. 确保 Vercel 项目未删除
2. 恢复 `next.config.mjs` 原始配置
3. 重新部署到 Vercel

## 生产环境迁移时间表

建议的迁移时间表：

1. 开发环境迁移：完成全部代码修改和测试
2. 预发布环境迁移：部署到 Cloudflare 但不切换域名
3. 生产环境迁移：先保持 Vercel 线上，创建 Cloudflare 部署
4. 域名切换：将域名从 Vercel 切换到 Cloudflare
5. 监控和回滚准备：密切监控服务，准备必要时回滚

## 后续优化建议

1. 考虑将数据库从 Neon 迁移至 Cloudflare D1，实现完全的 Cloudflare 生态
2. 利用 Cloudflare Workers 实现更多高性能边缘计算功能
3. 使用 Cloudflare Images 优化图片处理流程
4. 使用 Cloudflare KV 存储实现缓存和状态存储

## 支持资源

- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Next.js on Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-nextjs-site/)
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Neon PostgreSQL 文档](https://neon.tech/docs/)
