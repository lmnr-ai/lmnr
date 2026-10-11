import { useEffect, useState } from "react";

import { type SessionTraceNeighbor } from "@/lib/actions/sessions";

export type SessionNeighbors = { prev: SessionTraceNeighbor | null; next: SessionTraceNeighbor | null };

// Module-level so stepping back to a trace already visited renders its cards instantly
// (TraceViewSidePanel remounts its whole subtree on every trace switch).
const neighborsCache = new Map<string, SessionNeighbors>();

interface UseSessionNeighborsInput {
  projectId?: string;
  traceId?: string;
  sessionId?: string;
  startTime?: string;
  enabled: boolean;
}

export function useSessionNeighbors({ projectId, traceId, sessionId, startTime, enabled }: UseSessionNeighborsInput) {
  const hasSession = !!sessionId && sessionId !== "<null>";
  const key = enabled && hasSession && projectId && traceId && startTime ? traceId : undefined;
  const [fetched, setFetched] = useState<{ traceId: string; neighbors: SessionNeighbors } | undefined>();

  useEffect(() => {
    if (!key || !projectId || !sessionId || !startTime || neighborsCache.has(key)) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ traceId: key, startTime });
    fetch(`/api/projects/${projectId}/sessions/${encodeURIComponent(sessionId)}/neighbors?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load session neighbors");
        const neighbors = (await res.json()) as SessionNeighbors;
        neighborsCache.set(key, neighbors);
        setFetched({ traceId: key, neighbors });
      })
      // Cards are a navigation convenience; on failure they stay hidden rather than toast on every trace open.
      .catch(() => {});
    return () => controller.abort();
  }, [key, projectId, sessionId, startTime]);

  if (!key) return undefined;
  return neighborsCache.get(key) ?? (fetched?.traceId === key ? fetched.neighbors : undefined);
}
