import { db } from "@/db/db";
import { workflowRunOutputs, workflowRunsTable } from "@/db/schema";
import type { APIKeyUserType } from "@/server/APIKeyBodyRequest";
import { replaceCDNUrl } from "@/server/replaceCDNUrl";
import { sanitizeOutput } from "@/server/sanitizeOutput";
import { and, eq } from "drizzle-orm";

// 添加精简的类型定义，帮助限制返回的数据
type ImageMetadata = {
  filename: string;
  url?: string;
  thumbnail_url?: string;
  // 其他必要的小型元数据
};

export async function getRunsData(run_id: string, user?: APIKeyUserType) {
  // 先获取基本信息，不包含大型输出数据
  const basicData = await db.query.workflowRunsTable.findFirst({
    where: and(eq(workflowRunsTable.id, run_id)),
    with: {
      workflow: {
        columns: {
          org_id: true,
          user_id: true,
        },
      },
      // 不直接获取输出数据，减少传输量
    },
  });

  if (!basicData) {
    return null;
  }

  if (user) {
    if (user.org_id) {
      // is org api call, check org only
      if (basicData.workflow.org_id != user.org_id) {
        return null;
      }
    } else {
      // is user api call, check user only
      if (
        basicData.workflow.user_id != user.user_id &&
        basicData.workflow.org_id == null
      ) {
        return null;
      }
    }
  }

  // 只在成功状态时获取输出数据，减少不必要的查询
  let outputs = [];
  if (basicData.status === "success") {
    // 单独查询输出数据
    outputs = await db.query.workflowRunOutputs.findMany({
      where: eq(workflowRunOutputs.run_id, run_id),
      limit: 5, // 限制数量，避免获取太多历史数据
    });

    // 使用sanitizeOutput处理输出数据
    outputs = outputs.map(output => {
      // 深度清理数据
      const sanitizedData = sanitizeOutput(output.data);
      
      // 处理URL
      if (sanitizedData.images) {
        replaceUrls(sanitizedData.images, run_id);
      }
      
      if (sanitizedData.files) {
        replaceUrls(sanitizedData.files, run_id);
      }
      
      if (sanitizedData.gifs) {
        replaceUrls(sanitizedData.gifs, run_id);
      }
      
      // 返回清理后的输出数据
      return {
        ...output,
        data: sanitizedData
      };
    });
  }

  // 组合数据返回
  return {
    ...basicData,
    outputs: outputs,
  };
}

function replaceUrls(dataType: any[], dataId: string) {
  for (let j = 0; j < dataType.length; j++) {
    const element = dataType[j];
    element.url = replaceCDNUrl(
      `${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET}/outputs/runs/${dataId}/${element.filename}`,
    );
  }
}
