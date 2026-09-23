import { debounce } from "lodash";

import { type EvalRow } from "@/lib/evaluation/types";

import { flattenScores, mergeDatapointUpsertIntoRows, mergeTraceUpdateIntoRows } from "./utils";

/**
 * The query state that determines whether an in-memory realtime merge is
 * equivalent to the server's evaluation datapoint query.
 */
export interface EvaluationRealtimeQueryState {
  isComparison: boolean;
  search: string | null;
  filter: readonly string[];
  sortBy: string | null | undefined;
  sortDirection: "asc" | "desc" | null | undefined;
}

/**
 * The local merge helpers only understand the server's default ordering:
 * ascending datapoint index.  Once a query has any other constraint, let the
 * server re-evaluate membership and ordering instead of trying to reproduce
 * SQL/custom-column semantics in the browser.
 */
export function shouldMergeEvaluationRealtimeLocally(query: EvaluationRealtimeQueryState): boolean {
  return (
    !query.isComparison &&
    !query.search &&
    query.filter.length === 0 &&
    query.sortBy == null &&
    query.sortDirection == null
  );
}

export const EVALUATION_REALTIME_REFETCH_DEBOUNCE_MS = 250;
export const EVALUATION_REALTIME_REFETCH_MAX_WAIT_MS = 1_000;

export interface DebouncedEvaluationRefetch {
  schedule: () => void;
  cancel: () => void;
}

/**
 * Coalesce a burst of realtime events into one canonical datapoint refetch.
 * Keeping this lifecycle explicit lets callers cancel work when query state
 * changes or the component unmounts.
 */
export function createDebouncedEvaluationRefetch(
  refetch: () => void,
  wait = EVALUATION_REALTIME_REFETCH_DEBOUNCE_MS,
  maxWait = EVALUATION_REALTIME_REFETCH_MAX_WAIT_MS
): DebouncedEvaluationRefetch {
  const debounced = debounce(refetch, wait, {
    leading: false,
    maxWait: Math.max(wait, maxWait),
    trailing: true,
  });
  return {
    schedule: () => {
      debounced();
    },
    cancel: () => debounced.cancel(),
  };
}

interface EvaluationRealtimeHandlerOptions {
  isComparison: boolean;
  mergeLocally: boolean;
  updateData: (updater: (rows: EvalRow[]) => EvalRow[]) => void;
  addScoreName: (name: string) => void;
  revalidateStats: () => void;
  scheduleRefetch: () => void;
}

/**
 * Build the two evaluation SSE handlers.  This is deliberately independent
 * of React so the query-state contract and event side effects can be tested
 * without reproducing arbitrary filters/sorts in a browser test.
 */
export function createEvaluationRealtimeHandlers({
  isComparison,
  mergeLocally,
  updateData,
  addScoreName,
  revalidateStats,
  scheduleRefetch,
}: EvaluationRealtimeHandlerOptions) {
  return {
    datapoint_upsert: (event: MessageEvent) => {
      if (isComparison) return;
      try {
        const payload = JSON.parse(event.data) as { datapoints?: Array<EvalRow & { id: string }> };
        const datapoints = payload.datapoints ?? [];

        datapoints.forEach((incoming) => {
          const flattened = flattenScores(incoming["scores"]);
          if (mergeLocally) {
            updateData((rows) => mergeDatapointUpsertIntoRows(rows, incoming, flattened));
          }

          if (Object.keys(flattened).length === 0) return;
          Object.keys(flattened).forEach((key) => addScoreName(key.slice("score:".length)));
          revalidateStats();
        });

        if (!mergeLocally && datapoints.length > 0) scheduleRefetch();
      } catch (e) {
        // oxlint-disable-next-line no-console
        console.warn("Failed to parse realtime datapoint_upsert:", e);
      }
    },
    trace_update: (event: MessageEvent) => {
      if (isComparison) return;
      try {
        const payload = JSON.parse(event.data) as {
          traces?: Array<Record<string, unknown> & { id: string }>;
        };
        const traces = payload.traces ?? [];

        if (mergeLocally) {
          traces.forEach((trace) => updateData((rows) => mergeTraceUpdateIntoRows(rows, trace)));
        } else if (traces.length > 0) {
          scheduleRefetch();
        }
      } catch (e) {
        // oxlint-disable-next-line no-console
        console.warn("Failed to parse realtime trace_update:", e);
      }
    },
  };
}
