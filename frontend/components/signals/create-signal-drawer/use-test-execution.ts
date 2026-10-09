import { useCallback, useRef, useState } from "react";
import { type UseFormGetValues } from "react-hook-form";

import { schemaFieldsToJsonSchema } from "@/components/signals/utils";
import { type SignalTestResult } from "@/lib/actions/signals/execute";
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
  const [result, setResult] = useState<SignalTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Drops the in-flight run and its output, e.g. when another trace gets selected.
  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsExecuting(false);
    setResult(null);
    setError(null);
  }, []);

  const execute = useCallback(async () => {
    const prompt = getValues("prompt");
    const schemaFields = getValues("schemaFields");
    const llmProfileId = getValues("llmProfileId");
    const llmModel = getValues("llmModel");
    const traceId = selectedTrace?.id;

    if (!prompt || !schemaFields?.length || !traceId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsExecuting(true);
    setResult(null);
    setError(null);

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
          // Test runs resolve the LLM exactly like production: the signal's profile + model, or env.
          ...(llmProfileId && llmModel ? { llmProfileId, model: llmModel } : {}),
        }),
        signal: controller.signal,
      });

      if (!executeRes.ok) {
        const text = await executeRes.text();
        try {
          const err = JSON.parse(text);
          setError(err.error || "Failed to execute signal");
        } catch {
          setError(text || `HTTP ${executeRes.status}`);
        }
      } else {
        setResult((await executeRes.json()) as SignalTestResult);
      }
      onComplete?.();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setError(error instanceof Error ? error.message : "Unknown error");
      onComplete?.();
    } finally {
      // A superseded run must not clear the spinner of the run that replaced it.
      if (abortRef.current === controller) setIsExecuting(false);
    }
  }, [getValues, projectId, selectedTrace, onComplete]);

  return { isExecuting, result, error, execute, reset };
}
