# Changelog

## [Unreleased]

### Fixed
- Fixed local development storage issues:
  - Added bucket name to CDN URLs in `update-run` and `getStatusRoute`
  - Updated local storage configuration to use LocalStack
  - Fixed image upload and retrieval paths

### Changed
- Updated environment configuration:
  - Added support for local development with LocalStack
  - Separated production (R2) and development storage configs
  - Added proper CORS configuration for local development

### Added
- Added detailed API documentation
- Added local development setup guide
- Added comprehensive error handling for storage operations
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