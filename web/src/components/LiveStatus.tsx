"use client";

import { useStore } from "@/components/MachinesWS";
import { StatusBadge } from "@/components/StatusBadge";
import { TableCell } from "@/components/ui/table";
import { type findAllRuns } from "@/server/findAllRuns";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * 调用清理API，在工作流运行成功后延迟指定时间清理数据
 */
async function callCleanupAPI(runId: string, delaySeconds: number = 60) {
  try {
    const response = await fetch('/api/cleanup-run-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        run_id: runId,
        delay_seconds: delaySeconds
      })
    });

    if (!response.ok) {
      console.error('清理API调用失败:', await response.text());
    } else {
      console.log(`已安排在${delaySeconds}秒后清理run_id=${runId}的数据`);
    }
  } catch (error) {
    console.error('清理API调用出错:', error);
  }
}

export function LiveStatus({
  run,
}: {
  run: Awaited<ReturnType<typeof findAllRuns>>[0];
}) {
  const data = useStore(
    (state) =>
      state.data
        .filter((x) => x.id === run.id)
        .sort((a, b) => b.timestamp - a.timestamp)?.[0]
  );

  let status = run.status;
  const cleanupCalledRef = useRef(false);

  // const [view, setView] = useState<any>();
  // if (data?.json.event == "executing" && data.json.data.node == undefined) {
  //   status = "success";
  // } else
  if (data?.json.event == "executing") {
    if (data?.json?.data?.node == undefined) {
      status = "success";
    } else {
      status = "running";
    }
  } else if (data?.json.event == "uploading") {
    status = "uploading";
  } else if (data?.json.event == "success") {
    status = "success";
  } else if (data?.json.event == "failed") {
    status = "failed";
  }

  const router = useRouter();

  useEffect(() => {
    if (data?.json.event === "outputs_uploaded") {
      router.refresh();
    }
  }, [data?.json.event]);

  // 当状态变为success或failed时，调用清理API
  useEffect(() => {
    if ((status === "success" || status === "failed") && !cleanupCalledRef.current) {
      cleanupCalledRef.current = true; // 标记为已调用，防止重复调用
      callCleanupAPI(run.id);
    }
  }, [status, run.id]);

  return (
    <>
      <TableCell>
        {data && status != "success"
          ? `${data.json.event} - ${data.json.data.node}`
          : "-"}
      </TableCell>
      <TableCell className="truncate text-right">
        <StatusBadge status={status} />
      </TableCell>
    </>
  );
}
