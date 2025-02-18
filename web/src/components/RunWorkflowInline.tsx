"use client";

import { plainInputsToZod } from "../lib/workflowVersionInputsToZod";
import { publicRunStore } from "./VersionSelect";
import { callServerPromise } from "./callServerPromise";
import { LoadingIcon } from "@/components/LoadingIcon";
import AutoForm, { AutoFormSubmit } from "@/components/ui/auto-form";
import { Button } from "@/components/ui/button";
import type { getInputsFromWorkflow } from "@/lib/getInputsFromWorkflow";
import { createRun } from "@/server/createRun";
import { useAuth, useClerk } from "@clerk/nextjs";
import { Play } from "lucide-react";
import { useMemo, useState } from "react";

// For share page
export function RunWorkflowInline({
  inputs,
  workflow_version_id,
  machine_id,
}: {
  inputs: ReturnType<typeof getInputsFromWorkflow>;
  workflow_version_id: string;
  machine_id: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const user = useAuth();
  const clerk = useClerk();

  const schema = useMemo(() => {
    return plainInputsToZod(inputs);
  }, [inputs]);

  const {
    setRunId,
    loading,
    setLoading: setLoading2,
    setStatus,
  } = publicRunStore();

  const runWorkflow = async () => {
    if (!user.isSignedIn) {
      clerk.openSignIn({
        redirectUrl: window.location.href,
      });
      return;
    }
    console.log(values);

    const val = Object.keys(values).length > 0 ? values : undefined;
    setLoading2(true);
    setIsLoading(true);
    setStatus("preparing");
    try {
      const origin = window.location.origin;
      console.log("Starting workflow run...");
      
      const result = await callServerPromise(
        createRun({
          origin,
          workflow_version_id: workflow_version_id,
          machine_id: machine_id,
          inputs: val,
          runOrigin: "public-share",
        })
      );

      console.log("createRun result:", result);

      if (result && !("error" in result)) {
        if (result.isLocalMachine && result.endpoint && result.workflow_api) {
          console.log("Connecting to local ComfyUI...", {
            endpoint: result.endpoint,
            workflow_run_id: result.workflow_run_id,
            workflow_api: result.workflow_api
          });
          
          try {
            const wsEndpoint = result.endpoint.replace('http://', 'ws://');
            console.log("WebSocket endpoint:", wsEndpoint);
            
            const ws = new WebSocket(`${wsEndpoint}/ws`);
            
            // 添加连接超时处理
            const connectionTimeout = setTimeout(() => {
              console.error("WebSocket connection timeout");
              ws.close();
              setLoading2(false);
            }, 5000);
            
            ws.onopen = () => {
              clearTimeout(connectionTimeout);
              console.log("WebSocket connected, sending workflow...");
              try {
                // 简化消息格式
                const message = {
                  prompt: result.workflow_api,
                  client_id: result.workflow_run_id
                };

                console.log("Sending message:", JSON.stringify(message, null, 2));
                ws.send(JSON.stringify(message));
              } catch (error) {
                console.error("Error sending workflow:", error);
                setLoading2(false);
              }
            };

            ws.onerror = (error) => {
              clearTimeout(connectionTimeout);
              console.error("WebSocket error:", error);
              setLoading2(false);
            };

            ws.onclose = (event) => {
              clearTimeout(connectionTimeout);
              console.log("WebSocket closed:", event.code, event.reason);
              setLoading2(false);
            };

            ws.onmessage = (event) => {
              console.log("Raw message received:", event.data);
              try {
                const data = JSON.parse(event.data);
                console.log("Parsed message:", data);
                
                if (data.type === "status") {
                  console.log("Status update:", data.data);
                } else if (data.type === "progress") {
                  console.log("Progress:", data.data);
                } else if (data.type === "executed") {
                  console.log("Execution complete");
                  setLoading2(false);
                } else {
                  console.log("Unknown message type:", data.type);
                }
              } catch (error) {
                console.error("Error parsing message:", error);
              }
            };

          } catch (error) {
            console.error("Error creating WebSocket:", error);
            setLoading2(false);
          }
        } else {
          console.log("Using remote execution...");
          setRunId(result.workflow_run_id);
        }
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error("Workflow execution error:", error);
      setIsLoading(false);
      setLoading2(false);
    }
  };

  return (
    <>
      {schema && (
        <AutoForm
          formSchema={schema}
          values={values}
          onValuesChange={setValues}
          onSubmit={runWorkflow}
          className="px-1"
        >
          <div className="flex justify-end">
            <AutoFormSubmit disabled={isLoading || loading}>
              Run
              {isLoading || loading ? <LoadingIcon /> : <Play size={14} />}
            </AutoFormSubmit>
          </div>
        </AutoForm>
      )}
      {!schema && (
        <Button
          className="gap-2"
          disabled={isLoading || loading}
          onClick={runWorkflow}
        >
          Confirm {isLoading || loading ? <LoadingIcon /> : <Play size={14} />}
        </Button>
      )}
    </>
  );
}
