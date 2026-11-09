import { fetchApi } from "@/lib/api/fetch-api";
import { type TraceRow } from "@/lib/traces/types";

const sessionPath = (projectId: string, sessionId: string) =>
  `/api/projects/${projectId}/sessions/${encodeURIComponent(sessionId)}`;

/** SWR key for the session's per-model token totals. */
export const sessionModelTokensUrl = (projectId: string, sessionId: string) =>
  `${sessionPath(projectId, sessionId)}/model-tokens`;

/**
 * The session's trace rows. `background` marks a fetch that isn't the user opening the session (a live refresh, a
 * hover preview), so it isn't audited as a `session.view`.
 */
export const sessionTracesUrl = (projectId: string, sessionId: string, background: boolean) =>
  `${sessionPath(projectId, sessionId)}/traces${background ? "?background=1" : ""}`;

/** A session's trace rows in start-time order. */
export async function fetchSessionTraces(
  projectId: string,
  sessionId: string,
  background: boolean,
  signal?: AbortSignal
) {
  const result = await fetchApi<{ items: TraceRow[] }>(sessionTracesUrl(projectId, sessionId, background), { signal });
  return result.error === null ? { traces: result.data.items, error: null } : { traces: null, error: result.error };
}
