# Cloudflare Pages 部署和开发指南

本文档提供了在 Cloudflare Pages 上部署和开发 ComfyUI Deploy 应用的详细指南。

## 环境准备

### 需要的软件

- Node.js 18 或更高版本
- npm 9 或更高版本
- Wrangler CLI (`npm install -g wrangler`)

### 环境变量配置

在 Cloudflare Pages 控制台中配置以下环境变量：

```
# 身份验证
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_xxx
CLERK_SECRET_KEY=sk_xxx
JWT_SECRET=your_jwt_secret

# 存储配置
SPACES_ENDPOINT="https://xxx.r2.cloudflarestorage.com"
SPACES_ENDPOINT_CDN="https://pub-xxx.r2.dev"
SPACES_BUCKET="your-bucket-name"
SPACES_KEY="your-access-key"
SPACES_SECRET="your-secret-key"
SPACES_REGION="auto"
SPACES_CDN_DONT_INCLUDE_BUCKET="true"
SPACES_CDN_FORCE_PATH_STYLE="false"

# Cloudflare 环境标识
ENVIRONMENT="cloudflare"

# 数据库配置
POSTGRES_URL="your-database-url"
```

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

## 部署到 Cloudflare Pages

### 使用 GitHub 集成

1. 在 Cloudflare Pages 控制台创建新项目
2. 选择你的 GitHub 仓库
3. 配置构建设置：
   - 构建命令：`cd web && npm install && npm run build`
   - 输出目录：`web/.vercel/output/static`
   - Node.js 版本：18
4. 添加上面列出的环境变量
5. 部署项目

### 使用 Wrangler CLI 部署

```bash
# 构建项目
cd web
npm run build

# 部署到 Cloudflare Pages
npm run pages:deploy
```

## 问题排查

### 构建失败

- **Node.js 版本问题**：确保使用 Node.js 18+
- **依赖冲突**：使用 `--legacy-peer-deps` 安装依赖
- **模块不兼容**：检查是否有使用 Node.js 特定 API 的模块

### 运行时错误

- **Edge 运行时兼容性**：确保 API 路由使用正确的运行时（Edge 或 Node.js）
- **存储连接问题**：验证 R2 存储配置
- **数据库连接问题**：确保数据库连接字符串正确

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
