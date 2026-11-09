import { type TraceSpanCounts } from "@/lib/actions/traces/span-counts";
import { type TraceRow } from "@/lib/traces/types";

import { mergeFetched } from "../data/live-traces";

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
  patchTraces: (apply: (rows: TraceRow[]) => TraceRow[], liveIds?: string[]) => void;
  /** A settled fetch reflects every update, so it replaces the rows and ends live turns. */
  receiveTraces: (fetched: TraceRow[], settled: boolean) => void;
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

    receiveTraces: (fetched, settled) => {
      const live = settled ? NOT_LIVE : get().live;
      set({ traces: mergeFetched(get().traces, fetched, live), live, isLoading: false, error: undefined });
    },

    failTraces: (error, settled) => set({ error, isLoading: false, ...(settled ? { live: NOT_LIVE } : {}) }),
  });
