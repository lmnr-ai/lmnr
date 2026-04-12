import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/lib/hooks/use-toast";

interface UseTraceUserInputResult {
  userInput: string | null;
  isLoading: boolean;
}

export function useTraceUserInput(
  projectId: string | undefined,
  traceId: string | undefined,
  isShared: boolean
): UseTraceUserInputResult {
  const { toast } = useToast();
  const [userInput, setUserInput] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const lastTraceIdRef = useRef<string | undefined>(undefined);

  const fetchUserInput = useCallback(async () => {
    if (!traceId) return;

    const url = isShared
      ? `/api/shared/traces/${traceId}/user-input`
      : `/api/projects/${projectId}/traces/${traceId}/user-input`;

    setIsLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d: { error?: string }) => d?.error)
          .catch(() => null);
        throw new Error(errMessage ?? "Failed to fetch user input");
      }
      const data = (await res.json()) as { input: string | null };
      setUserInput(data.input);
    } catch (error) {
      toast({
        variant: "destructive",
        title: error instanceof Error ? error.message : "Failed to fetch user input",
      });
      setUserInput(null);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, traceId, isShared, toast]);

  useEffect(() => {
    if (traceId === lastTraceIdRef.current) return;
    lastTraceIdRef.current = traceId;

    if (!traceId) {
      setUserInput(null);
      return;
    }

    fetchUserInput();
  }, [traceId, fetchUserInput]);

  return { userInput, isLoading };
}
