import { db } from "@/db/db";
import { workflowRunOutputs, workflowRuns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { setTimeout } from "timers/promises";
import { auth } from "@clerk/nextjs";

// 根据环境变量使用不同的运行时
export const runtime = process.env.ENVIRONMENT === "cloudflare" ? "edge" : "nodejs";
export const preferredRegion = "auto";
export const dynamic = "force-dynamic";

/**
 * 清理run输出和输入中的图片数据
 * 接收run_id参数，延迟指定秒数后清理相关的图片数据
 * 
 * 路由: POST /api/cleanup-run-data
 * 参数: { run_id: string, delay_seconds?: number }
 * 返回: { success: boolean, message: string }
 */
export async function POST(request: Request) {
  try {
    // 验证用户身份（可选，如果需要）
    const { userId, orgId } = auth();
    
    // 解析请求内容
    const { run_id, delay_seconds = 60 } = await request.json();
    
    if (!run_id) {
      return NextResponse.json(
        { success: false, message: "run_id参数缺失" },
        { status: 400 }
      );
    }
    
    // 记录任务
    console.log(`安排清理任务: run_id=${run_id}, 延迟=${delay_seconds}秒`);
    
    // 使用Promise.resolve()和setTimeout创建一个不阻塞主线程的异步任务
    // 注意：在serverless环境中，函数可能在完成前被终止
    Promise.resolve().then(async () => {
      try {
        // 等待指定时间
        console.log(`开始等待${delay_seconds}秒后清理run_id=${run_id}的数据...`);
        await setTimeout(delay_seconds * 1000);
        
        // 1. 清理输出数据 (workflow_run_outputs表)
        await cleanupOutputData(run_id);
        
        // 2. 清理输入数据 (workflow_runs表的workflow_inputs字段)
        await cleanupInputData(run_id);
        
        console.log(`成功清理了run_id=${run_id}的全部相关数据`);
      } catch (error) {
        console.error(`清理run_id=${run_id}的数据时出错:`, error);
      }
    });
    
    // 立即返回成功响应
    return NextResponse.json(
      { 
        success: true, 
        message: `已安排在${delay_seconds}秒后清理run_id=${run_id}的图片数据` 
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("清理API错误:", error);
    return NextResponse.json(
      { success: false, message: `清理请求处理时出错: ${error.message}` },
      { status: 500 }
    );
  }
}

/**
 * 清理输出数据中的图片信息
 */
async function cleanupOutputData(run_id: string): Promise<void> {
  // 查询所有相关输出记录
  const outputs = await db.query.workflowRunOutputs.findMany({
    where: eq(workflowRunOutputs.run_id, run_id)
  });
  
  console.log(`找到${outputs.length}条输出记录需要清理`);
  
  let cleanedCount = 0;
  
  // 处理每个输出记录
  for (const output of outputs) {
    if (!output.data || !output.data.images || !Array.isArray(output.data.images)) {
      continue;
    }
    
    // 创建清理后的数据对象
    const cleanedData = { ...output.data };
    
    // 清理图片数据，但保留元数据
    cleanedData.images = cleanedData.images.map((image: any) => {
      // 创建干净的图片对象，只保留必要的元数据
      const cleanImage: any = { 
        filename: image.filename,
        url: image.url,
        thumbnail_url: image.thumbnail_url
      };
      
      // 保留其他重要的元数据
      if (image.width) cleanImage.width = image.width;
      if (image.height) cleanImage.height = image.height;
      if (image.type) cleanImage.type = image.type;
      
      return cleanImage;
    });
    
    // 更新数据库记录
    await db.update(workflowRunOutputs)
      .set({ data: cleanedData })
      .where(eq(workflowRunOutputs.id, output.id));
    
    cleanedCount++;
  }
  
  console.log(`成功清理了${cleanedCount}条输出记录的图片数据`);
}

/**
 * 清理输入数据中的图片信息
 */
async function cleanupInputData(run_id: string): Promise<void> {
  // 查询工作流运行记录
  const runRecord = await db.query.workflowRuns.findFirst({
    where: eq(workflowRuns.id, run_id)
  });
  
  if (!runRecord || !runRecord.workflow_inputs) {
    console.log(`未找到run_id=${run_id}的输入记录或没有输入数据`);
    return;
  }
  
  console.log(`开始清理run_id=${run_id}的输入数据`);
  
  // 复制输入数据
  const cleanedInputs = { ...runRecord.workflow_inputs };
  let hasChanges = false;
  
  // 遍历所有输入字段，查找并清理base64图片数据
  for (const key in cleanedInputs) {
    const value = cleanedInputs[key];
    
    // 检查是否为base64图片数据
    if (typeof value === 'string' && 
        (value.startsWith('data:image/') || 
         value.startsWith('data:application/octet-stream;base64'))) {
      
      // 如果字段中包含URL信息，提取并保留URL
      const urlMatch = value.match(/url=(https?:\/\/[^'"&]+)/);
      if (urlMatch && urlMatch[1]) {
        cleanedInputs[key] = urlMatch[1];
      } else {
        // 否则替换为占位符，表明这里曾有图片数据
        cleanedInputs[key] = `[图片数据已清理-原始格式:${value.substring(0, value.indexOf(';'))}]`;
      }
      
      hasChanges = true;
      console.log(`清理了输入字段 "${key}" 中的图片数据`);
    }
    
    // 如果是对象或数组，递归检查内部可能存在的图片数据
    if (typeof value === 'object' && value !== null) {
      const processedValue = cleanRecursively(value);
      if (processedValue.changed) {
        cleanedInputs[key] = processedValue.data;
        hasChanges = true;
      }
    }
  }
  
  // 只有在有变更时才更新数据库
  if (hasChanges) {
    await db.update(workflowRuns)
      .set({ workflow_inputs: cleanedInputs })
      .where(eq(workflowRuns.id, run_id));
    
    console.log(`成功清理了run_id=${run_id}的输入数据中的图片`);
  } else {
    console.log(`run_id=${run_id}的输入数据中没有需要清理的图片`);
  }
}

/**
 * 递归清理对象中的图片数据
 */
function cleanRecursively(obj: any): { data: any, changed: boolean } {
  // 如果不是对象或是null，直接返回
  if (typeof obj !== 'object' || obj === null) {
    // 如果是base64图片字符串，清理它
    if (typeof obj === 'string' && 
        (obj.startsWith('data:image/') || 
         obj.startsWith('data:application/octet-stream;base64'))) {
      
      const urlMatch = obj.match(/url=(https?:\/\/[^'"&]+)/);
      if (urlMatch && urlMatch[1]) {
        return { data: urlMatch[1], changed: true };
      } else {
        return { 
          data: `[图片数据已清理-原始格式:${obj.substring(0, obj.indexOf(';'))}]`, 
          changed: true 
        };
      }
    }
    return { data: obj, changed: false };
  }
  
  // 处理数组
  if (Array.isArray(obj)) {
    let changed = false;
    const newArray = [];
    
    for (const item of obj) {
      const processedItem = cleanRecursively(item);
      newArray.push(processedItem.data);
      if (processedItem.changed) {
        changed = true;
      }
    }
    
    return { data: newArray, changed };
  }
  
  // 处理普通对象
  let changed = false;
  const newObj = { ...obj };
  
  for (const key in newObj) {
    // 跳过继承的属性
    if (!Object.prototype.hasOwnProperty.call(newObj, key)) continue;
    
    const processedValue = cleanRecursively(newObj[key]);
    if (processedValue.changed) {
      newObj[key] = processedValue.data;
      changed = true;
    }
  }
  
  return { data: newObj, changed };
} 