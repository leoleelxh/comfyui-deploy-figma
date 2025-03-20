/**
 * 自动化数据清理脚本
 * 
 * 这个脚本设计用于在定时任务(cron job)中运行，无需用户交互
 * 可用于定期自动清理历史图片数据，释放数据库空间
 * 
 * 使用方法:
 * node scripts/scheduled-cleanup.js --days 60 --limit 1000 --storage 0
 * 
 * 参数:
 * --days: 清理多少天前的数据 (默认: 30)
 * --limit: 每次处理的记录数量限制 (默认: 500)
 * --storage: 是否清理存储中的文件 (0=不清理, 1=清理, 默认: 0)
 * --log: 日志文件路径 (可选)
 */

import { db } from "../src/db/db.js";
import { workflowRunOutputs, workflowRunsTable } from "../src/db/schema.js";
import { and, eq, lt, sql } from "drizzle-orm";
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// 加载环境变量
dotenv.config({ path: '.env.local' });

// 创建日志函数
function createLogger(logFilePath) {
  const logToFile = logFilePath ? true : false;
  let logStream;
  
  if (logToFile) {
    // 确保日志目录存在
    const logDir = path.dirname(logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // 创建日志文件流
    logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
  }
  
  return {
    info: (message) => {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] INFO: ${message}`;
      console.log(logMessage);
      if (logToFile) logStream.write(logMessage + '\n');
    },
    
    error: (message, error) => {
      const timestamp = new Date().toISOString();
      const errorDetail = error ? `: ${error.message}\n${error.stack}` : '';
      const logMessage = `[${timestamp}] ERROR: ${message}${errorDetail}`;
      console.error(logMessage);
      if (logToFile) logStream.write(logMessage + '\n');
    },
    
    success: (message) => {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] SUCCESS: ${message}`;
      console.log(logMessage);
      if (logToFile) logStream.write(logMessage + '\n');
    },
    
    close: () => {
      if (logToFile) logStream.end();
    }
  };
}

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
const storageArg = args.indexOf('--storage');
const logArg = args.indexOf('--log');

const days = daysArg !== -1 ? parseInt(args[daysArg + 1]) : 30;
const limit = limitArg !== -1 ? parseInt(args[limitArg + 1]) : 500;
const cleanStorage = storageArg !== -1 ? parseInt(args[storageArg + 1]) === 1 : false;
const logPath = logArg !== -1 ? args[logArg + 1] : null;

// 创建日志记录器
const logger = createLogger(logPath);

// 计算截止日期
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - days);

/**
 * 清理数据库中的图片数据
 */
async function cleanupDatabaseImageData() {
  logger.info(`开始清理 ${days} 天前的数据库图片数据（${cutoffDate.toISOString()}）`);
  logger.info(`处理记录数量限制: ${limit}`);
  
  try {
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

    if (oldRuns.length === 0) {
      logger.info("没有找到需要清理的记录，任务完成");
      return 0;
    }

    logger.info(`找到 ${oldRuns.length} 条记录需要清理`);

    let totalImageCount = 0;
    let processedRunCount = 0;
    
    // 记录已处理的run_id，用于后续清理存储
    const processedRunIds = [];

    // 处理每个运行记录
    for (const run of oldRuns) {
      processedRunCount++;
      processedRunIds.push(run.id);
      logger.info(`处理运行记录 ${processedRunCount}/${oldRuns.length}: ${run.id}`);
      
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
          await db.update(workflowRunOutputs)
            .set({ data: cleanedData })
            .where(eq(workflowRunOutputs.id, output.id));
          
          logger.info(`清理了 ${imageCount} 张图片数据（运行ID: ${run.id}, 输出 ${i+1}/${run.outputs.length}）`);
        }
      }
    }
    
    logger.success(`数据库清理完成: 处理了 ${processedRunCount} 个运行记录中的 ${totalImageCount} 张图片数据`);
    return processedRunIds;
  } catch (error) {
    logger.error("清理数据库时发生错误", error);
    throw error;
  }
}

/**
 * 清理存储中的图片文件
 */
async function cleanupStorageImageFiles(processedRunIds) {
  if (!cleanStorage || !processedRunIds || processedRunIds.length === 0) {
    logger.info("跳过存储清理");
    return 0;
  }
  
  logger.info("开始清理存储中的图片文件");
  
  try {
    let totalDeleted = 0;
    
    // 对每个已处理的run_id清理对应的存储文件
    for (const runId of processedRunIds) {
      logger.info(`清理运行ID: ${runId} 的存储文件`);
      
      // 列出此运行记录的所有文件
      const listCommand = new ListObjectsV2Command({
        Bucket: process.env.SPACES_BUCKET,
        Prefix: `outputs/runs/${runId}/`,
        MaxKeys: 1000
      });
      
      const listResult = await s3Client.send(listCommand);
      
      if (!listResult.Contents || listResult.Contents.length === 0) {
        logger.info(`运行ID: ${runId} 没有找到需要清理的文件`);
        continue;
      }
      
      // 删除找到的文件
      let deletedCount = 0;
      for (const object of listResult.Contents) {
        logger.info(`删除文件: ${object.Key}`);
        
        const deleteCommand = new DeleteObjectCommand({
          Bucket: process.env.SPACES_BUCKET,
          Key: object.Key
        });
        
        await s3Client.send(deleteCommand);
        deletedCount++;
      }
      
      logger.info(`已删除运行ID: ${runId} 的 ${deletedCount} 个文件`);
      totalDeleted += deletedCount;
    }
    
    logger.success(`存储清理完成: 共删除 ${totalDeleted} 个文件`);
    return totalDeleted;
  } catch (error) {
    logger.error("清理存储文件时发生错误", error);
    throw error;
  }
}

// 主函数
async function main() {
  logger.info("=== 自动化数据清理脚本开始执行 ===");
  
  try {
    // 1. 清理数据库中的图片数据
    const processedRunIds = await cleanupDatabaseImageData();
    
    // 2. 清理存储中的文件（如果启用）
    if (cleanStorage) {
      await cleanupStorageImageFiles(processedRunIds);
    }
    
    logger.success("清理操作成功完成");
  } catch (error) {
    logger.error("清理操作失败", error);
    process.exitCode = 1;
  } finally {
    logger.info("=== 自动化数据清理脚本执行结束 ===");
    logger.close();
  }
}

// 执行主函数
main(); 