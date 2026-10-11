import { useEffect, useState } from "react";

type SessionTraceIds = { ids: string[]; truncated: boolean };

// Module-level and keyed by session so stepping through one session's traces pays the
// session-wide scan once (TraceViewSidePanel remounts on every trace switch).
const idsCache = new Map<string, SessionTraceIds>();
// A trace newer than the cached list triggers one refetch; this stops a trace that is never
// listed (non-DEFAULT type) from refetching on every render.
const refetchedFor = new Set<string>();

export type SessionPosition = { index: number; total: number; truncated: boolean };

export function useSessionPosition(projectId?: string, sessionId?: string, traceId?: string) {
  const key = projectId && sessionId && sessionId !== "<null>" ? `${projectId}::${sessionId}` : undefined;
  const [, setVersion] = useState(0);

  const cached = key ? idsCache.get(key) : undefined;
  const missingFromCache = !!cached && !!traceId && !cached.truncated && !cached.ids.includes(traceId);
  const needsFetch = !!key && !!traceId && (!cached || (missingFromCache && !refetchedFor.has(`${key}::${traceId}`)));

  useEffect(() => {
    if (!needsFetch || !key || !projectId || !sessionId || !traceId) return;
    if (missingFromCache) refetchedFor.add(`${key}::${traceId}`);
    const controller = new AbortController();
    fetch(`/api/projects/${projectId}/sessions/${encodeURIComponent(sessionId)}/trace-ids`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load session trace ids");
        idsCache.set(key, (await res.json()) as SessionTraceIds);
        setVersion((v) => v + 1);
      })
      // The badge is informational; on failure it stays hidden rather than toast on every trace open.
      .catch(() => {});
    return () => controller.abort();
  }, [needsFetch, missingFromCache, key, projectId, sessionId, traceId]);

  if (!cached || !traceId) return undefined;
  const index = cached.ids.indexOf(traceId);
  if (index === -1) return undefined;
  return { index: index + 1, total: cached.ids.length, truncated: cached.truncated } satisfies SessionPosition;
}
