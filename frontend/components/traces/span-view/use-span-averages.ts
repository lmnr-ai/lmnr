import { useEffect, useRef, useState } from "react";

import { type SpanAverageStats } from "@/lib/actions/trace/averages";

export function useSpanAverages(projectId: string | undefined) {
  const [averages, setAverages] = useState<SpanAverageStats | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!projectId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetch(`/api/projects/${projectId}/spans/averages`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (response.ok) return response.json();
        return null;
      })
      .then((data: SpanAverageStats | null) => {
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
  }, [projectId]);

  return averages;
}
