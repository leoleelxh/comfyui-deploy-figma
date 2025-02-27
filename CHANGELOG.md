# Changelog

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

### Added

- Added status polling mechanism:
  - New `/api/status/{task_id}` endpoint
  - Task status tracking
  - Progress reporting
  - Error handling

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
