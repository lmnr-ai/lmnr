import { fetchApi } from "@/lib/api/fetch-api";
import { type TraceRow } from "@/lib/traces/types";

const sessionPath = (projectId: string, sessionId: string) =>
  `/api/projects/${projectId}/sessions/${encodeURIComponent(sessionId)}`;

/** SWR key for the session's per-model token totals. */
export const sessionModelTokensUrl = (projectId: string, sessionId: string) =>
  `${sessionPath(projectId, sessionId)}/model-tokens`;

/** A session's trace rows in start-time order. `refresh` marks a reload of an open session, which isn't audited again. */
export async function fetchSessionTraces(projectId: string, sessionId: string, refresh: boolean, signal?: AbortSignal) {
  const query = refresh ? "?refresh=1" : "";
  const result = await fetchApi<{ items: TraceRow[] }>(`${sessionPath(projectId, sessionId)}/traces${query}`, {
    signal,
  });
  return result.error === null ? { traces: result.data.items, error: null } : { traces: null, error: result.error };
}
