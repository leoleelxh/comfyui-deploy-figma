# Changelog

All notable changes to this project will be documented in this file.

## [released 1.2]
开始修复本地s3图片拼接url问题

### 回退到可重试ComfyUI版本，但是会多次发送任务问题

## [released 1.0]

### 回退到可重试ComfyUI版本，但是会多次发送任务问题

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
