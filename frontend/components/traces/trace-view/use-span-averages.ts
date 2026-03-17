import { useEffect, useRef, useState } from "react";

import { type TraceAverageStats } from "@/lib/actions/trace/averages";

export function useTraceAverages(projectId: string | undefined, traceId: string | undefined) {
  const [averages, setAverages] = useState<TraceAverageStats | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!projectId || !traceId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetch(`/api/projects/${projectId}/traces/${traceId}/averages`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (response.ok) return response.json();
        return null;
      })
      .then((data: TraceAverageStats | null) => {
        if (data && !controller.signal.aborted) {
          setAverages(data);
        }
      })
      .catch(() => {
        // Silently fail - deviation stats are non-critical
      });

    return () => {
      controller.abort();
    };
  }, [projectId, traceId]);

  return averages;
}
