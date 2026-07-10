import { useEffect, useMemo, useRef, useState } from "react";

import { MAIN_AGENT_SEARCH_WINDOW } from "@/components/traces/trace-view/store/utils";
import { useToast } from "@/lib/hooks/use-toast";
import { tryParseJson } from "@/lib/utils";

interface UseTraceUserInputResult {
  userInput: string | null;
  isLoading: boolean;
}

export function useTraceUserInput(
  projectId: string | undefined,
  traceId: string | undefined,
  isShared: boolean,
  llmSpanCount: number,
  traceMetadata?: string
): UseTraceUserInputResult {
  const { toast } = useToast();
  const [userInput, setUserInput] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Track the span count we resolved against so we can refetch until the
  // server has at least MAIN_AGENT_SEARCH_WINDOW LLM spans to pick from.
  const resolvedRef = useRef<{ traceId: string; input: string | null; llmSpanCount: number } | null>(null);

  // User task extracted at ingestion (string on success, `false` when
  // extraction found nothing, absent when it never ran).
  const metadataUserTask = useMemo(() => {
    const task = tryParseJson(traceMetadata ?? "")?.lmnr_user_task;
    return typeof task === "string" && task.trim().length > 0 ? task : null;
  }, [traceMetadata]);

  useEffect(() => {
    if (!traceId) {
      setUserInput(null);
      resolvedRef.current = null;
      return;
    }

    if (metadataUserTask) {
      setUserInput(metadataUserTask);
      resolvedRef.current = null;
      return;
    }

    // Only fetch once we know there is at least one LLM span in the trace,
    // since extraction relies on LLM span inputs. Before then, leave the hook
    // in its idle state so the UI can skip rendering a placeholder input row.
    if (llmSpanCount === 0) {
      return;
    }

    if (
      resolvedRef.current?.traceId === traceId &&
      (resolvedRef.current.input !== null || resolvedRef.current.llmSpanCount >= MAIN_AGENT_SEARCH_WINDOW)
    ) {
      return;
    }

    const controller = new AbortController();

    const fetchUserInput = async () => {
      const url = isShared
        ? `/api/shared/traces/${traceId}/user-input`
        : `/api/projects/${projectId}/traces/${traceId}/user-input`;

      setIsLoading(true);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          const errMessage = await res
            .json()
            .then((d: { error?: string }) => d?.error)
            .catch(() => null);
          throw new Error(errMessage ?? "Failed to fetch user input");
        }
        const data = (await res.json()) as { input: string | null };
        setUserInput(data.input);
        resolvedRef.current = { traceId, input: data.input, llmSpanCount };
      } catch (error) {
        if (controller.signal.aborted) return;
        toast({
          variant: "destructive",
          title: error instanceof Error ? error.message : "Failed to fetch user input",
        });
        setUserInput(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserInput();

    return () => controller.abort();
  }, [projectId, traceId, isShared, llmSpanCount, metadataUserTask, toast]);

  return { userInput, isLoading };
}
