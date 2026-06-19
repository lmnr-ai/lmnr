import { useCallback, useRef, useState } from "react";
import { type UseFormGetValues } from "react-hook-form";

import { schemaFieldsToJsonSchema } from "@/components/signals/utils";
import { type TraceRow } from "@/lib/traces/types";

import { type ManageSignalForm } from "./types";

export default function useTestExecution({
  getValues,
  projectId,
  selectedTrace,
  onComplete,
}: {
  getValues: UseFormGetValues<ManageSignalForm>;
  projectId: string;
  selectedTrace: TraceRow | null;
  onComplete?: () => void;
}) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [testOutput, setTestOutput] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(async () => {
    const prompt = getValues("prompt");
    const schemaFields = getValues("schemaFields");
    const traceId = selectedTrace?.id;

    if (!prompt || !schemaFields?.length || !traceId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsExecuting(true);
    setTestOutput("");

    try {
      const executeRes = await fetch(`/api/projects/${projectId}/signals/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          traceId,
          signal: {
            prompt,
            structured_output_schema: schemaFieldsToJsonSchema(schemaFields),
          },
        }),
        signal: controller.signal,
      });

      if (!executeRes.ok) {
        const text = await executeRes.text();
        try {
          const err = JSON.parse(text);
          setTestOutput(`Error: ${err.error || "Failed to execute signal"}`);
        } catch {
          setTestOutput(`Error: ${text || `HTTP ${executeRes.status}`}`);
        }
      } else {
        const result = await executeRes.json();
        setTestOutput(typeof result === "string" ? result : JSON.stringify(result, null, 2));
      }
      onComplete?.();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setTestOutput(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      onComplete?.();
    } finally {
      setIsExecuting(false);
    }
  }, [getValues, projectId, selectedTrace, onComplete]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsExecuting(false);
    setTestOutput("");
  }, []);

  return { isExecuting, testOutput, execute, clear };
}
