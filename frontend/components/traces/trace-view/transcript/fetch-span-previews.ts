import { convertToTimeParameters } from "@/lib/time";

export interface FetchSpanPreviewsParams {
  projectId: string | undefined;
  traceId: string;
  /** All span IDs relevant to this batch — regular + input IDs. The server
   *  routes input IDs via `inputSpanIds` into the userInputs response map. */
  spanIds: string[];
  /** Subset of spanIds whose INPUT should be returned (as `userInputs[id]`).
   *  Typically the first-LLM spanId for each reader-mode agent group. */
  inputSpanIds?: string[];
  /** Map spanId → spanType (LLM/CACHED/EXECUTOR/…). Hint for the server. */
  spanTypes?: Record<string, string>;
  /** Trace window; optional. If provided, expanded by ±1s to cover clock skew. */
  startTime?: string;
  endTime?: string;
  isShared?: boolean;
  signal?: AbortSignal;
}

export interface FetchSpanPreviewsResult {
  previews: Record<string, any>;
  inputPreviews: Record<string, string | null>;
  agentNames: Record<string, string | null>;
}

/**
 * Store-free preview fetcher. Shared by `useBatchedSpanPreviews` (trace view)
 * and `useSessionSpanPreviews` (session view).
 *
 * Matches the body / URL shape the previous inline implementation used — if
 * you change this, grep for the server endpoint and keep it in sync.
 */
export async function fetchSpanPreviewsForTrace({
  projectId,
  traceId,
  spanIds,
  inputSpanIds,
  spanTypes,
  startTime,
  endTime,
  isShared = false,
  signal,
}: FetchSpanPreviewsParams): Promise<FetchSpanPreviewsResult> {
  if (spanIds.length === 0 || !traceId) {
    return { previews: {}, inputPreviews: {}, agentNames: {} };
  }

  const inputIdSet = new Set(inputSpanIds ?? []);
  const regularIds = spanIds.filter((id) => !inputIdSet.has(id));
  const inputIds = spanIds.filter((id) => inputIdSet.has(id));

  const body: Record<string, any> = {
    // Preserve legacy behavior: if there are no regular IDs, fall back to the
    // full union so at least the input IDs are carried on the request.
    spanIds: regularIds.length > 0 ? regularIds : spanIds,
    spanTypes: spanTypes ?? {},
  };

  if (inputIds.length > 0) {
    body.inputSpanIds = inputIds;
    body.spanIds = [...new Set([...regularIds, ...inputIds])];
  }

  if (startTime && endTime) {
    const s = new Date(new Date(startTime).getTime() - 1000).toISOString();
    const e = new Date(new Date(endTime).getTime() + 1000).toISOString();
    const params = convertToTimeParameters({ startTime: s, endTime: e });
    body.startDate = params.start_time;
    body.endDate = params.end_time;
  }

  const url = isShared
    ? `/api/shared/traces/${traceId}/spans/previews`
    : `/api/projects/${projectId}/traces/${traceId}/spans/previews`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({ error: "Failed to fetch span previews" }))) as {
      error?: string;
    };
    throw new Error(err.error || "Failed to fetch span previews");
  }

  const data = (await response.json()) as FetchSpanPreviewsResult;
  return {
    previews: data.previews ?? {},
    inputPreviews: data.inputPreviews ?? {},
    agentNames: data.agentNames ?? {},
  };
}
