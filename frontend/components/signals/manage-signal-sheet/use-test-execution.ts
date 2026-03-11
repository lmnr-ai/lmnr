import { useCallback, useState } from "react";
import { type UseFormGetValues } from "react-hook-form";

import { schemaFieldsToJsonSchema } from "@/components/signals/utils";
import { type TraceRow } from "@/lib/traces/types";

import { type ManageSignalForm } from "./types";

export default function useTestExecution({
  getValues,
  projectId,
  selectedTrace,
}: {
  getValues: UseFormGetValues<ManageSignalForm>;
  projectId: string;
  selectedTrace: TraceRow | null;
}) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [testOutput, setTestOutput] = useState("");

  const execute = useCallback(async () => {
    const prompt = getValues("prompt");
    const schemaFields = getValues("schemaFields");
    const traceId = selectedTrace?.id;

    if (!prompt || !schemaFields?.length || !traceId) return;

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
      });

      const result = await executeRes.json();

      if (!executeRes.ok) {
        setTestOutput(`Error: ${result.error || "Failed to execute signal"}`);
      } else {
        setTestOutput(typeof result === "string" ? result : JSON.stringify(result, null, 2));
      }
    } catch (error) {
      setTestOutput(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsExecuting(false);
    }
  }, [getValues, projectId, selectedTrace]);

  return { isExecuting, testOutput, execute };
}
