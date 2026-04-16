import { useEffect, useRef, useState } from "react";

import { useToast } from "@/lib/hooks/use-toast";

interface UseTraceUserInputResult {
  userInput: string | null;
  isLoading: boolean;
}

export function useTraceUserInput(
  projectId: string | undefined,
  traceId: string | undefined,
  isShared: boolean,
  hasLlmSpan: boolean
): UseTraceUserInputResult {
  const { toast } = useToast();
  const [userInput, setUserInput] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Track whether we've already successfully resolved input for this trace so
  // we don't keep refetching on every LLM span arrival.
  const resolvedRef = useRef<{ traceId: string; input: string | null } | null>(null);

  useEffect(() => {
    if (!traceId) {
      setUserInput(null);
      resolvedRef.current = null;
      return;
    }

    // Only fetch once we know there is at least one LLM span in the trace,
    // since extraction relies on LLM span inputs. Before then, leave the hook
    // in its idle state so the UI can skip rendering a placeholder input row.
    if (!hasLlmSpan) {
      return;
    }

    // If we've already resolved a non-null input for this trace, skip refetch.
    if (resolvedRef.current?.traceId === traceId && resolvedRef.current.input !== null) {
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
        resolvedRef.current = { traceId, input: data.input };
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
  }, [projectId, traceId, isShared, hasLlmSpan, toast]);

  return { userInput, isLoading };
}
