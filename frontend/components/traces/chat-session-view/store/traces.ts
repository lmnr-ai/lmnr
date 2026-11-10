import { type TraceSpanCounts } from "@/lib/actions/traces/span-counts";
import { type TraceRow } from "@/lib/traces/types";

import { mergeFetched, withLiveInputs } from "../data/live-traces";

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
  /** Live agent inputs by trace id, kept until a fetched row carries its own. */
  liveInputs: Readonly<Record<string, unknown>>;
  isLoading: boolean;
  error?: string;

  /** Patches the rows with a realtime update; `liveIds` mark the turns it touched as live. */
  patchTraces: (apply: TracesPatch, liveIds?: string[]) => void;
  /** A turn's agent input, from realtime; held until its row exists and the server has it. */
  receiveAgentInput: (traceId: string, agentInput: unknown) => void;
  /**
   * Replays the patches applied while the fetch was in flight on top of it, since it may predate them. A settled
   * fetch reflects every update, so it ends live turns, except ones it's missing (ClickHouse can lag). Returns how
   * many live turns it was missing.
   */
  receiveTraces: (fetched: TraceRow[], settled: boolean, patchesSinceFetch: TracesPatch[]) => number;
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
    liveInputs: {},
    isLoading: true,

    patchTraces: (apply, liveIds) => {
      const { traces, live, liveInputs } = get();
      set({
        traces: withLiveInputs(apply(traces), liveInputs),
        ...(liveIds?.length ? { live: new Set([...live, ...liveIds]) } : {}),
      });
    },

    receiveAgentInput: (traceId, agentInput) => {
      const liveInputs = { ...get().liveInputs, [traceId]: agentInput };
      set({ liveInputs, traces: withLiveInputs(get().traces, liveInputs) });
    },

    receiveTraces: (fetched, settled, patchesSinceFetch) => {
      const fetchedIds = new Set(fetched.map((t) => t.id));
      const missing = [...get().live].filter((id) => !fetchedIds.has(id));
      const live = settled ? (missing.length ? new Set(missing) : NOT_LIVE) : get().live;
      const patched = patchesSinceFetch.reduce((rows, apply) => apply(rows), fetched);
      const caughtUp = new Set(fetched.filter((t) => t.agentInput).map((t) => t.id));
      const liveInputs = Object.fromEntries(Object.entries(get().liveInputs).filter(([id]) => !caughtUp.has(id)));
      set({
        traces: withLiveInputs(mergeFetched(get().traces, patched, live), liveInputs),
        live,
        liveInputs,
        isLoading: false,
        error: undefined,
      });
      return missing.length;
    },

    failTraces: (error, settled) => set({ error, isLoading: false, ...(settled ? { live: NOT_LIVE } : {}) }),
  });
