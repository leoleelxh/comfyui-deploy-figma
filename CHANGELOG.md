# Changelog

All notable changes to this project will be documented in this file.

## [released 1.2]

开始修复本地 s3 图片拼接 url 问题

### 回退到可重试 ComfyUI 版本，但是会多次发送任务问题

## [released 1.0]

### 回退到可重试 ComfyUI 版本，但是会多次发送任务问题

## [Unreleased]

### Fixed

- Fixed image URL format inconsistency:

  - Removed bucket name from CDN URLs in `update-run`
  - Standardized URL format to `${CDN_ENDPOINT}/outputs/runs/${run_id}/${filename}`
  - Fixed image access issues in API responses

- Fixed CORS issues:

  - Updated CORS configuration in `vercel.json`
  - Added proper headers for Figma plugin support
  - Fixed cross-origin resource sharing for API endpoints

- Fixed Vercel 60s timeout issue:
  - Implemented asynchronous task processing
  - Added immediate task ID response
  - Added status polling mechanism
  - Separated task creation and processing

### Changed

- Updated API response handling:

  - Added status polling endpoint
  - Improved error handling
  - Enhanced progress tracking

- Improved image handling:
  - Automatically convert base64 images to CDN URLs
  - Upload images to R2 storage before processing
  - Use CDN URLs for ComfyUI input

### Added

- Added status polling mechanism:

  - New `/api/status/{task_id}` endpoint
  - Task status tracking
  - Progress reporting
  - Error handling

- 图片处理功能增强

  - 支持 base64 图片自动转换为 R2 存储 URL
  - 优化 ComfyUIDeployExternalImage 组件的图片处理流程
  - 添加图片上传状态追踪和日志

- 添加服务器端图片压缩功能，确保传入 ComfyUI 的图片大小控制在 1MB 以内
- 使用 sharp 库进行智能图片压缩，保持原始尺寸但减小文件大小

## [1.x.x] - 2024-02-28

### Added

- Vercel build configuration to only deploy from main branch

### Changed

- Image upload system now preserves original image formats (JPG, PNG, WebP)
- Improved error handling in image processing pipeline

### Fixed

- Fixed issue where large images (>1MB) would cause ComfyUI to become unresponsive
- Fixed image format conversion that was unnecessarily increasing file sizes
- Improved stability of ComfyUI communication

## [1.0.1] - 2024-02-27

### Fixed

- Fixed local development storage issues:
  - Updated local storage configuration
  - Fixed image upload and retrieval paths

### Changed

- Updated environment configuration:
  - Added support for local development
  - Separated production and development configs

### Added

- Added comprehensive error handling
- New ComfyUIDeployExternalBoolean component
- Support for boolean input values
- Improved component documentation

## Setup Guide

### Local Development

1. Environment Setup:

```env
# Local storage (LocalStack)
SPACES_ENDPOINT="http://172.26.61.86:4566"
SPACES_ENDPOINT_CDN="http://172.26.61.86:4566"
SPACES_BUCKET="comfyui-deploy"
SPACES_KEY="test"
SPACES_SECRET="test"
SPACES_REGION="us-east-1"
SPACES_CDN_DONT_INCLUDE_BUCKET="false"
SPACES_CDN_FORCE_PATH_STYLE="true"
```

2. LocalStack Configuration:

```bash
# Configure AWS CLI
aws configure
# Use:
# Access Key: test
# Secret Key: test
# Region: us-east-1
# Format: json

# Create bucket
aws --endpoint-url=http://172.26.61.86:4566 s3 mb s3://comfyui-deploy

# Set bucket public access
aws --endpoint-url=http://172.26.61.86:4566 s3api put-bucket-acl --bucket comfyui-deploy --acl public-read
```

## [1.0.0] - 2024-03-XX

### Added

- ComfyUIDeployExternalLora component
- ComfyUIDeployExternalCheckpoint component
- Support for model file URL inputs
- Basic component framework
- Initial documentation

### Changed

- Standardized component naming convention
- Improved error handling
- Enhanced type safety

### Fixed

- Input value type conversion issues
- Component registration process

- 改进工作流处理逻辑

  - 优化参数传递机制，确保与原有逻辑保持一致
  - 调整异步处理顺序：先完成图片上传，再发送工作流
  - 增强错误处理和日志记录

- 修复图片参数传递问题
  - 修正 input_id 参数的处理逻辑
  - 确保图片 URL 正确传递到 ComfyUI 节点

## [Previous Version] - YYYY-MM-DD

[Previous changelog entries...]

## [released 1.3] - 2024-03-XX

### Fixed

- Fixed image URL inconsistency in API responses:
  - Standardized URL handling in `update-run` API endpoint
  - Ensured consistent URL format between frontend and Figma plugin
  - Fixed URL construction to properly handle bucket names in different environments
  - Unified URL handling through `replaceCDNUrl` function

### Technical Details

#### URL Format by Environment

1. R2 Production (Current):

   - Input: `https://xxx.r2.cloudflarestorage.com/comfyui-deploy/outputs/runs/{run_id}/{filename}`
   - Output: `https://pub-xxx.r2.dev/outputs/runs/{run_id}/{filename}`
   - Bucket name is removed from path

2. Local Development:
   - Input: `http://localhost:4566/comfyui-deploy/outputs/runs/{run_id}/{filename}`
   - Output: `http://localhost:4566/comfyui-deploy/outputs/runs/{run_id}/{filename}`
   - Bucket name is preserved in path

## [1.4.0] - 2024-03-XX

### Changed

- 优化了任务创建逻辑，移除了不必要的幂等性检查
- 简化了状态管理，减少了数据库操作
- 改进了错误处理机制，增加了重试功能

### Added

- 添加了请求超时控制（55 秒）
- 添加了指数退避重试机制（最多 3 次重试）
- 添加了更详细的错误日志

### Fixed

- 修复了 Figma 插件多次创建相同任务的问题
- 修复了任务状态更新不及时的问题
- 修复了在高负载情况下的稳定性问题

### Technical Details

- 重试机制：
  - 最大重试次数：3 次
  - 重试间隔：指数退避（2^n 秒）
  - 超时设置：55 秒（适配 Vercel 限制）
- 错误处理：
  - 网络错误自动重试
  - 超时错误立即失败
  - 保留详细错误信息
- 状态管理：
  - 创建时不设置初始状态
  - 成功时更新 started_at
  - 失败时设置 status: "failed"

## [1.1.0] - 2024-03-XX

### Changed

- 优化了 ComfyUI 通讯机制
  - 使用 Promise.race 替代 AbortController 进行超时控制，提高了在 Vercel Serverless 环境下的稳定性
  - 将单次请求超时时间调整为 30 秒，避免触发 Vercel 60 秒限制
  - 优化重试机制，使用线性增长的等待时间（2-6 秒），提高请求成功率
  - 改进了超时错误处理，当请求超时时会将任务标记为已开始，避免因超时导致任务丢失

### Fixed

- 修复了在 Vercel 环境下因请求超时导致 Figma 插件不进入轮询状态的问题
- 修复了在网络状态不稳定时可能出现的任务状态不一致问题

## [1.1.1] - 2025-03-07

### Fixed

- Fixed image upload URL construction for different storage environments
  - Added support for LocalStack S3 in development environment
  - Maintained compatibility with Cloudflare R2 in production
  - Fixed image access issues in ComfyUI workflow
- Added environment-aware URL path construction
  - Uses bucket name in path for LocalStack (`SPACES_CDN_FORCE_PATH_STYLE=true`)
  - Maintains clean URLs for R2 (`SPACES_CDN_FORCE_PATH_STYLE=false`)
