# 从 Vercel 迁移到 Cloudflare Pages 的迁移清单

本文档提供了将应用从 Vercel 迁移到 Cloudflare Pages 的完整检查清单，确保迁移过程顺利进行。

## 代码修改检查清单

### 配置文件

- [x] 创建 `wrangler.toml` 文件，设置必要的 Cloudflare Pages 配置
- [x] 更新 `next.config.mjs`，添加 Cloudflare Pages 兼容设置
  - [x] 设置 `output: "standalone"`
  - [x] 配置图片处理选项
  - [x] 添加 webpack 配置以处理 Edge Runtime 兼容性

### API 路由调整

- [x] 为 API 路由添加条件运行时标记
  - [x] 使用 `export const runtime = process.env.ENVIRONMENT === "cloudflare" ? "edge" : "nodejs"`
  - [x] 添加 `export const preferredRegion = "auto"`
  - [x] 添加 `export const dynamic = "force-dynamic"`

### 库和模块适配

- [x] 更新 JWT 处理，使其在 Edge Runtime 中工作
  - [x] 使用 `jose` 库用于 Cloudflare 环境
  - [x] 保留 `jsonwebtoken` 支持用于本地开发

### 数据库连接

- [x] 调整数据库连接以支持 Cloudflare 环境
  - [x] 根据 `ENVIRONMENT` 变量调整连接配置
  - [x] 确保本地开发使用正确的连接方式

### 构建和部署脚本

- [x] 添加 Cloudflare Pages 相关的 npm 脚本
  - [x] `pages:build`
  - [x] `pages:deploy`
  - [x] `pages:dev`

### 环境变量

- [x] 创建 `.env.local` 和 Cloudflare 环境变量配置指南
- [x] 在 `package.json` 中设置正确的环境变量读取方式

## 环境变量配置清单

在 Cloudflare Pages 控制台中配置以下环境变量：

### 必需的环境变量

- [ ] `ENVIRONMENT="cloudflare"`
- [ ] `POSTGRES_URL`（数据库连接字符串）
- [ ] `POSTGRES_SSL="true"`（在 Cloudflare 环境中一般为 true）
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`（Clerk 公钥）
- [ ] `CLERK_SECRET_KEY`（Clerk 密钥）
- [ ] `JWT_SECRET`（用于 JWT 令牌生成和验证）

### 存储配置

- [ ] `SPACES_ENDPOINT`（对象存储端点）
- [ ] `SPACES_ENDPOINT_CDN`（CDN 端点）
- [ ] `SPACES_REGION`（存储区域）
- [ ] `SPACES_BUCKET`（存储桶名称）
- [ ] `SPACES_KEY`（访问密钥）
- [ ] `SPACES_SECRET`（密钥）
- [ ] `SPACES_CDN_DONT_INCLUDE_BUCKET`（是否在 URL 中包含桶名）
- [ ] `SPACES_CDN_FORCE_PATH_STYLE`（是否使用路径样式 URL）

### 其他可选环境变量

- [ ] `NEXT_PUBLIC_POSTHOG_KEY`（分析工具密钥）
- [ ] `NEXT_PUBLIC_POSTHOG_HOST`（分析工具主机）
- [ ] `COMFYUI_BACKEND_URL`（后端服务 URL）

## 部署和验证检查清单

### 部署前检查

- [ ] 本地开发环境测试所有功能（使用 `npm run dev`）
- [ ] 测试 Cloudflare Pages 本地环境（使用 `npm run pages:dev`）
- [ ] 确保所有环境变量都已在 Cloudflare 控制台配置

### 部署流程

- [ ] 推送代码到 GitHub 仓库
- [ ] 在 Cloudflare Pages 控制台设置 GitHub 集成
- [ ] 配置构建设置（命令和输出目录）
- [ ] 添加所有必要环境变量
- [ ] 触发部署

### 部署后验证

- [ ] 确认页面正常加载
- [ ] 测试用户认证功能
- [ ] 测试 API 端点
- [ ] 测试文件上传和存储
- [ ] 测试工作流创建和运行
- [ ] 检查数据库连接
- [ ] 验证环境变量是否正确应用

## 故障排除检查清单

如果部署后出现问题，请检查：

- [ ] Cloudflare Pages 构建日志
- [ ] 浏览器控制台错误
- [ ] 环境变量配置
- [ ] API 路由是否正确标记运行时
- [ ] 数据库连接是否有效
- [ ] 存储配置是否正确

## 迁移后清理检查清单

完成从 Vercel 到 Cloudflare Pages 的迁移后：

- [ ] 备份 Vercel 配置和环境变量
- [ ] 在确认 Cloudflare Pages 部署稳定后，考虑停用 Vercel 部署
- [ ] 更新 DNS 设置（如果使用自定义域名）
- [ ] 更新文档和团队成员通知

## 进阶优化检查清单

迁移成功后，考虑以下优化：

- [ ] 启用 Cloudflare Page Rules 和缓存策略
- [ ] 配置 Cloudflare Analytics
- [ ] 探索使用 Cloudflare R2 替代现有存储解决方案
- [ ] 考虑迁移到 Cloudflare D1 数据库
- [ ] 设置 Cloudflare 监控和警报
