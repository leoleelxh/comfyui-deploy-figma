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
        if (result.isLocalMachine) {
          console.log("Connecting to local ComfyUI...", result.endpoint);
          
          const ws = new WebSocket('ws://127.0.0.1:8188/ws');
          
          ws.onopen = () => {
            console.log("WebSocket connected!");
            ws.send(JSON.stringify({
              type: 'execute',
              data: {
                workflow: result.workflow_api,
                inputs: val,
                prompt_id: result.workflow_run_id
              }
            }));
          };

          ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            setLoading2(false);
          };

          ws.onclose = () => {
            console.log("WebSocket connection closed");
          };

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
