import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (!traceId) {
      setUserInput(null);
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
  }, [projectId, traceId, isShared, toast]);

  return { userInput, isLoading };
}
