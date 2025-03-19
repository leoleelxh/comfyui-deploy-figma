# ComfyUI Deploy 迁移到 Cloudflare Pages - 完整改动清单

## 已完成的修改

1. **添加配置文件**

   - 创建了 `wrangler.toml` 配置文件
   - 指定了兼容性标志 `nodejs_compat` 以支持 Node.js API

2. **修改 Next.js 配置**

   - 更新了 `next.config.mjs` 以支持 Cloudflare Pages
   - 添加了 `output: "standalone"` 配置
   - 配置了图片优化选项 `images: { unoptimized: true }`
   - 添加了 `experimental` 配置项

3. **添加 Edge 运行时标记**

   - 为以下 API 路由添加了 `export const runtime = "edge"` 标记：
     - `web/src/app/(app)/api/[[...routes]]/route.ts`
     - `web/src/app/(app)/api/update-run/route.ts`
     - `web/src/app/(app)/api/file-upload/route.ts`
     - `web/src/app/(app)/api/view/route.ts`
     - `web/src/app/(app)/api/upload/route.ts`
     - `web/src/app/(app)/api/machine-built/route.ts`

4. **更新数据库连接**

   - 修改了 `web/src/db/db.ts` 以检测 Cloudflare 环境
   - 添加了 `process.env.ENVIRONMENT !== "cloudflare"` 条件判断

5. **添加部署脚本**

   - 在 `package.json` 中添加了 Cloudflare Pages 相关脚本：
     - `pages:build`
     - `pages:deploy`
     - `pages:dev`

6. **创建文档**
   - 创建了 `docs/cloudflare-deployment.md` 部署指南
   - 创建了 `docs/migration-checklist.md` 迁移清单

## 需要在 Cloudflare 控制台配置的内容

1. **环境变量**

   - `POSTGRES_URL`: Neon PostgreSQL 连接字符串
   - `SPACES_ENDPOINT`: R2/S3 端点
   - `SPACES_ENDPOINT_CDN`: CDN 端点
   - `SPACES_BUCKET`: 存储桶名称
   - `SPACES_KEY`: 访问密钥
   - `SPACES_SECRET`: 密钥
   - `JWT_SECRET`: JWT 密钥
   - `CLERK_SECRET_KEY`: Clerk 密钥
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk 公钥
   - `SPACES_CDN_DONT_INCLUDE_BUCKET`: 配置项 (true/false)
   - `SPACES_CDN_FORCE_PATH_STYLE`: 配置项 (true/false)
   - `ENVIRONMENT`: 设置为 "cloudflare"

2. **构建设置**
   - 项目名称: `comfyui-deploy-figma`
   - 构建命令: `npm run pages:build`
   - 构建输出目录: `.vercel/output/static`
   - Node.js 版本: 18.x

## 潜在兼容性问题

1. **MDX 搜索功能**

   - `web/src/mdx/search.mjs` 文件使用了 Node.js 文件系统 API
   - 由于此功能只在构建时使用，不会在运行时调用，因此不需要修改

2. **数据库连接**

   - 需要确保 Neon PostgreSQL 允许从 Cloudflare Workers 连接
   - 可能需要为 Cloudflare 环境创建专门的连接字符串

3. **图片处理**
   - 需要确保 S3/R2 配置正确
   - 图片优化在 Cloudflare 环境中已禁用 (`unoptimized: true`)

## 本地测试步骤

1. 安装依赖

   ```bash
   npm install
   ```

2. 启动本地开发环境

   ```bash
   npm run pages:dev
   ```

3. 构建测试
   ```bash
   npm run pages:build
   ```

## 部署步骤

1. 确保所有代码修改已提交到 GitHub

2. 在 Cloudflare 控制台创建新项目

   - 连接 GitHub 仓库
   - 配置构建设置和环境变量

3. 触发部署

   ```bash
   npm run pages:deploy
   ```

4. 检查部署是否成功
   - 确认 API 路由正常工作
   - 确认页面正常显示
   - 测试核心功能（上传、状态查询等）

## 回滚计划

如需回滚到 Vercel 部署：

1. 恢复 `next.config.mjs` 原始配置
2. 重新部署到 Vercel
3. 更新任何已更改的 DNS 记录
