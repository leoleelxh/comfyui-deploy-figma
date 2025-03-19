#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 根目录
const rootDir = path.resolve(__dirname, '..');
const webDir = path.join(rootDir, 'web');
const apiDir = path.join(webDir, 'src/app');

// 条件运行时配置
const edgeRuntimeConfig = `export const runtime = "edge";`;
const conditionalRuntimeConfig = `export const runtime = process.env.ENVIRONMENT === "cloudflare" ? "edge" : "nodejs";`;

/**
 * 递归查找所有 route.ts 文件
 * @param {string} dir - 要搜索的目录
 * @param {Array<string>} fileList - 已找到的文件列表
 * @returns {Array<string>} - 所有找到的 route.ts 文件路径列表
 */
function findRouteFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findRouteFiles(filePath, fileList);
    } else if ((file === 'route.ts' || file === 'route.tsx') && filePath.includes('api')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

/**
 * 更新文件中的运行时配置
 * @param {string} filePath - 要更新的文件路径
 */
function updateRuntimeConfig(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // 如果文件包含 Edge 运行时配置，则替换为条件运行时配置
  if (content.includes(edgeRuntimeConfig)) {
    content = content.replace(edgeRuntimeConfig, conditionalRuntimeConfig);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`已更新: ${filePath}`);
  } else if (!content.includes(conditionalRuntimeConfig)) {
    // 如果文件既没有 Edge 配置也没有条件配置，则尝试添加
    // 找到合适的位置添加运行时配置（在 import 语句之后，函数定义之前）
    const lines = content.split('\n');
    let lastImportIndex = -1;
    let firstFunctionIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) {
        lastImportIndex = i;
      } else if (lines[i].startsWith('export async function') || lines[i].startsWith('export function')) {
        firstFunctionIndex = i;
        break;
      }
    }
    
    // 在适当位置插入条件运行时配置
    if (lastImportIndex !== -1 && firstFunctionIndex !== -1) {
      lines.splice(lastImportIndex + 1, 0, '', '// 根据环境变量使用不同的运行时', conditionalRuntimeConfig, 'export const preferredRegion = "auto";', 'export const dynamic = "force-dynamic";', '');
      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
      console.log(`已添加: ${filePath}`);
    } else {
      console.log(`跳过: ${filePath} - 无法确定插入位置`);
    }
  } else {
    console.log(`已存在条件配置: ${filePath}`);
  }
}

// 主执行函数
function main() {
  console.log('开始查找 API 路由文件...');
  const routeFiles = findRouteFiles(apiDir);
  console.log(`找到 ${routeFiles.length} 个 API 路由文件`);
  
  let updated = 0;
  let skipped = 0;
  
  routeFiles.forEach(file => {
    try {
      updateRuntimeConfig(file);
      updated++;
    } catch (error) {
      console.error(`更新 ${file} 时出错:`, error.message);
      skipped++;
    }
  });
  
  console.log('=== 更新完成 ===');
  console.log(`总计: ${routeFiles.length}`);
  console.log(`已更新: ${updated}`);
  console.log(`已跳过: ${skipped}`);
}

// 运行主函数
main(); 