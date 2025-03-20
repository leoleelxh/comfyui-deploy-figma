/**
 * 历史图片数据清理脚本
 * 
 * 这个脚本用于安全地清理Neon数据库中的历史图片数据，同时保留：
 * - 用户信息
 * - 工作流信息
 * - 生成记录(runs表)
 * 
 * 使用方法:
 * node scripts/cleanup-image-data.js --days 30 --limit 1000 --dryrun
 * 
 * 参数:
 * --days: 清理多少天前的数据 (默认: 30)
 * --limit: 每次处理的记录数量限制 (默认: 1000)
 * --dryrun: 只模拟运行，不实际删除数据 (默认: false)
 */

import { db } from "../src/db/db.js";
import { workflowRunOutputs, workflowRunsTable } from "../src/db/schema.js";
import { and, eq, lt, sql } from "drizzle-orm";
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

// 加载环境变量
dotenv.config({ path: '.env.local' });

// 创建S3客户端
const s3Client = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  region: process.env.SPACES_REGION || "auto",
  credentials: {
    accessKeyId: process.env.SPACES_KEY || "",
    secretAccessKey: process.env.SPACES_SECRET || "",
  },
  forcePathStyle: process.env.SPACES_CDN_FORCE_PATH_STYLE === "true",
});

// 解析命令行参数
const args = process.argv.slice(2);
const daysArg = args.indexOf('--days');
const limitArg = args.indexOf('--limit');
const dryRunArg = args.indexOf('--dryrun');

const days = daysArg !== -1 ? parseInt(args[daysArg + 1]) : 30;
const limit = limitArg !== -1 ? parseInt(args[limitArg + 1]) : 1000;
const dryRun = dryRunArg !== -1;

// 计算截止日期
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - days);

console.log(`=== 历史图片数据清理脚本 ===`);
console.log(`清理 ${days} 天前的数据（${cutoffDate.toISOString()}）`);
console.log(`处理记录数量限制: ${limit}`);
console.log(`模拟运行模式: ${dryRun ? '是' : '否'}`);
console.log("===============================\n");

/**
 * 清理数据库中的图片数据
 */
async function cleanupDatabaseImageData() {
  console.log("正在查询需要清理的输出记录...");
  
  // 查找所有在截止日期之前、成功的运行记录
  const oldRuns = await db.query.workflowRunsTable.findMany({
    where: and(
      lt(workflowRunsTable.created_at, cutoffDate),
      eq(workflowRunsTable.status, "success")
    ),
    limit: limit,
    with: {
      outputs: true
    }
  });

  console.log(`找到 ${oldRuns.length} 条记录需要清理`);

  let totalImageCount = 0;
  let processedRunCount = 0;

  // 处理每个运行记录
  for (const run of oldRuns) {
    processedRunCount++;
    console.log(`处理运行记录 ${processedRunCount}/${oldRuns.length}: ${run.id}`);
    
    // 处理此运行记录下的所有输出
    for (let i = 0; i < run.outputs.length; i++) {
      const output = run.outputs[i];
      if (!output.data) continue;
      
      // 检查输出数据中是否有图片
      if (output.data.images && Array.isArray(output.data.images)) {
        const imageCount = output.data.images.length;
        totalImageCount += imageCount;
        
        // 创建清理后的输出数据
        const cleanedData = { ...output.data };
        
        // 清理图片数据，但保留元数据
        cleanedData.images = cleanedData.images.map(image => {
          // 创建干净的图片对象，只保留必要的元数据
          const cleanImage = { 
            filename: image.filename,
            url: image.url,
            thumbnail_url: image.thumbnail_url
          };
          
          // 如果有其他重要的元数据，可以保留
          if (image.width) cleanImage.width = image.width;
          if (image.height) cleanImage.height = image.height;
          if (image.type) cleanImage.type = image.type;
          
          return cleanImage;
        });
        
        // 更新数据库中的记录
        if (!dryRun) {
          await db.update(workflowRunOutputs)
            .set({ data: cleanedData })
            .where(eq(workflowRunOutputs.id, output.id));
        }
        
        console.log(`  - 清理 ${imageCount} 张图片数据（输出 ${i+1}/${run.outputs.length}）`);
      }
    }
  }
  
  console.log(`\n总结：清理了 ${processedRunCount} 个运行记录中的 ${totalImageCount} 张图片数据。`);
}

/**
 * 可选：清理存储中的实际图片文件
 * 注意：此功能需谨慎使用，建议先备份或确保有其他副本
 */
async function cleanupStorageImageFiles() {
  console.log("\n注意：此操作将永久删除存储中的实际图片文件！");
  if (dryRun) {
    console.log("模拟运行模式：不会实际删除文件");
  }
  
  try {
    console.log("正在列出存储桶中的旧文件...");
    
    // 计算cutoffDate的Unix时间戳（毫秒）
    const cutoffTimestamp = cutoffDate.getTime();
    
    // 列出存储桶中的对象
    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.SPACES_BUCKET,
      Prefix: "outputs/runs/",
      MaxKeys: limit
    });
    
    const listResult = await s3Client.send(listCommand);
    
    if (!listResult.Contents || listResult.Contents.length === 0) {
      console.log("没有找到需要清理的文件");
      return;
    }
    
    console.log(`找到 ${listResult.Contents.length} 个文件`);
    
    let deleteCount = 0;
    
    // 筛选并删除旧文件
    for (const object of listResult.Contents) {
      // 检查文件最后修改时间是否早于截止日期
      if (object.LastModified && object.LastModified.getTime() < cutoffTimestamp) {
        console.log(`准备删除: ${object.Key} (修改于 ${object.LastModified.toISOString()})`);
        
        if (!dryRun) {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: process.env.SPACES_BUCKET,
            Key: object.Key
          });
          
          await s3Client.send(deleteCommand);
        }
        
        deleteCount++;
      }
    }
    
    console.log(`\n总结：找到 ${deleteCount} 个需要删除的文件`);
    if (dryRun) {
      console.log("模拟运行模式：没有实际删除任何文件");
    } else {
      console.log(`成功删除 ${deleteCount} 个文件`);
    }
  } catch (error) {
    console.error("清理存储文件时出错:", error);
  }
}

// 主函数
async function main() {
  try {
    // 1. 清理数据库中的图片数据
    await cleanupDatabaseImageData();
    
    // 2. 询问是否要清理存储中的实际图片文件
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    readline.question('\n是否要清理存储中的实际图片文件？这将永久删除文件！(yes/no) ', async (answer) => {
      if (answer.toLowerCase() === 'yes') {
        await cleanupStorageImageFiles();
      } else {
        console.log("跳过清理存储中的文件");
      }
      
      console.log("\n清理操作完成！");
      process.exit(0);
    });
  } catch (error) {
    console.error("脚本执行错误:", error);
    process.exit(1);
  }
}

// 执行主函数
main(); 