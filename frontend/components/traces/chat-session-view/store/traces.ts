import { type TraceSpanCounts } from "@/lib/actions/traces/span-counts";
import { type TraceRow } from "@/lib/traces/types";

import { mergeFetched } from "../data/live-traces";

export type TracesPatch = (rows: TraceRow[]) => TraceRow[];

export interface TracesDeps {
  loadReply: (traceId: string) => Promise<string | null | undefined>;
  loadCounts: (traceId: string) => Promise<TraceSpanCounts | undefined>;
}

/** The session's trace rows: fetched from the server, patched by realtime deltas in between. */
export interface TracesSlice extends TracesDeps {
  traces: TraceRow[];
  /** Turns with live updates no server fetch reflects yet. */
  live: ReadonlySet<string>;
  isLoading: boolean;
  error?: string;

  /** Patches the rows with a realtime update; `liveIds` mark the turns it touched as live. */
  patchTraces: (apply: TracesPatch, liveIds?: string[]) => void;
  /**
   * Replays the patches applied while the fetch was in flight on top of it, since it may predate them. A settled
   * fetch reflects every update, so it ends live turns.
   */
  receiveTraces: (fetched: TraceRow[], settled: boolean, patchesSinceFetch: TracesPatch[]) => void;
  /** A failed fetch keeps the rows already shown; a settled one still ends live turns. */
  failTraces: (error: string, settled: boolean) => void;
}

const NOT_LIVE: ReadonlySet<string> = new Set();

export const createTracesSlice =
  (deps: TracesDeps) =>
  (set: (partial: Partial<TracesSlice>) => void, get: () => TracesSlice): TracesSlice => ({
    ...deps,
    traces: [],
    live: NOT_LIVE,
    isLoading: true,

    patchTraces: (apply, liveIds) => {
      const { traces, live } = get();
      set({
        traces: apply(traces),
        ...(liveIds?.length ? { live: new Set([...live, ...liveIds]) } : {}),
      });
    },

    receiveTraces: (fetched, settled, patchesSinceFetch) => {
      const live = settled ? NOT_LIVE : get().live;
      const patched = patchesSinceFetch.reduce((rows, apply) => apply(rows), fetched);
      set({ traces: mergeFetched(get().traces, patched, live), live, isLoading: false, error: undefined });
    },

    failTraces: (error, settled) => set({ error, isLoading: false, ...(settled ? { live: NOT_LIVE } : {}) }),
  });
