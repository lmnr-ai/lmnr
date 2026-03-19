import { useEffect, useRef, useState } from "react";

import { type AverageCostStats } from "@/lib/actions/trace/averages";

export function useAverageCost(projectId: string | undefined, endpoint: "traces" | "spans") {
  const [averages, setAverages] = useState<AverageCostStats | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!projectId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetch(`/api/projects/${projectId}/${endpoint}/averages`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (response.ok) return response.json();
        return null;
      })
      .then((data: AverageCostStats | null) => {
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
  }, [projectId, endpoint]);

  return averages;
}
