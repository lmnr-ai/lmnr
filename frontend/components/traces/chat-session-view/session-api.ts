import { fetchApi } from "@/lib/api/fetch-api";
import { type TraceRow } from "@/lib/traces/types";

const sessionPath = (projectId: string, sessionId: string) =>
  `/api/projects/${projectId}/sessions/${encodeURIComponent(sessionId)}`;

/** SWR key for the session's per-model token totals. */
export const sessionModelTokensUrl = (projectId: string, sessionId: string) =>
  `${sessionPath(projectId, sessionId)}/model-tokens`;

/** A session's trace rows in start-time order. */
export async function fetchSessionTraces(projectId: string, sessionId: string, signal?: AbortSignal) {
  const result = await fetchApi<{ items: TraceRow[] }>(`${sessionPath(projectId, sessionId)}/traces`, { signal });
  return result.error === null ? { traces: result.data.items, error: null } : { traces: null, error: result.error };
}
