import { createStore } from "zustand";

import { type TraceSpanCounts } from "@/lib/actions/traces/span-counts";
import { createBatchedLoader } from "@/lib/batched-loader";
import { type TraceRow } from "@/lib/traces/types";

import {
  applySyncEvent,
  initialSyncState,
  isLive,
  needsReconcile,
  type ReplyEntry,
  type SyncEvent,
  type SyncState,
} from "./sync";

/** Everything the live session reads from or tells the outside world. Injected so tests can drive it. */
export interface LiveSessionDeps {
  loadTraces: () => Promise<{ traces: TraceRow[] } | { error: string }>;
  /** `undefined` marks the chunk as failed. Ids missing from the result have no reply. */
  loadReplies: (traceIds: string[]) => Promise<Record<string, string | null> | undefined>;
  loadCounts: (traceIds: string[]) => Promise<Record<string, TraceSpanCounts> | undefined>;
  /** Called after each refresh that followed live updates (e.g. to revalidate session-wide totals). */
  onRefreshed?: () => void;
  /** Wait for a burst of live updates to settle before refreshing from the server. */
  settleMs?: number;
}

export interface LiveSessionState {
  sync: SyncState;
  replies: Record<string, ReplyEntry>;
  counts: Record<string, TraceSpanCounts>;
  /** Loads the session; call once on mount. */
  start: () => void;
  /** Applies a realtime event. */
  receive: (event: Exclude<SyncEvent, { type: "snapshot" | "snapshotFailed" }>) => void;
  /** Loads replies and span counts for turns being shown; already loaded or loading ones are skipped. */
  requestDetails: (traceIds: string[]) => void;
  retryReply: (traceId: string) => void;
  /** Stops timers and ignores responses still in flight. */
  dispose: () => void;
}

const DEFAULT_SETTLE_MS = 2000;

export const createLiveSessionStore = ({
  loadTraces,
  loadReplies,
  loadCounts,
  onRefreshed,
  settleMs = DEFAULT_SETTLE_MS,
}: LiveSessionDeps) =>
  createStore<LiveSessionState>()((set, get) => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let loading = false;

    const replyLoader = createBatchedLoader<string | null>({
      load: async (ids) => {
        const replies = await loadReplies(ids);
        return replies && Object.fromEntries(ids.map((id) => [id, replies[id] ?? null]));
      },
      onLoaded: (loaded) => {
        if (disposed) return;
        const entries = Object.fromEntries(
          Object.entries(loaded).map(([id, text]) => [id, { kind: "loaded", text } as const])
        );
        set({ replies: { ...get().replies, ...entries } });
      },
      onFailed: (ids) => {
        if (disposed) return;
        set({
          replies: { ...get().replies, ...Object.fromEntries(ids.map((id) => [id, { kind: "failed" } as const])) },
        });
      },
      isResolved: (id) => id in get().replies,
    });

    // Counts are decoration: a failed load just leaves them unresolved, retried when the turn is requested again.
    const countLoader = createBatchedLoader<TraceSpanCounts>({
      load: loadCounts,
      onLoaded: (loaded) => {
        if (!disposed) set({ counts: { ...get().counts, ...loaded } });
      },
      isResolved: (id) => id in get().counts,
    });

    const dispatch = (event: SyncEvent) => set({ sync: applySyncEvent(get().sync, event) });

    // One request at a time: an older snapshot landing after a newer one would roll rows back.
    const load = async (afterLiveUpdates: boolean) => {
      if (loading) return;
      loading = true;
      try {
        const requestedAtSeq = get().sync.seq;
        const wasLive = get()
          .sync.traces.filter((t) => isLive(get().sync, t.id))
          .map((t) => t.id);
        const result = await loadTraces();
        if (disposed) return;
        if ("error" in result) {
          dispatch({ type: "snapshotFailed", error: result.error });
          return;
        }
        dispatch({ type: "snapshot", traces: result.traces, requestedAtSeq });

        // Turns this snapshot settled may have new replies and spans since they were last loaded.
        const settled = wasLive.filter((id) => !isLive(get().sync, id));
        if (settled.length > 0) {
          set({ replies: omitKeys(get().replies, settled), counts: omitKeys(get().counts, settled) });
          replyLoader.invalidate(settled);
          countLoader.invalidate(settled);
          get().requestDetails(settled);
        }
        if (afterLiveUpdates) onRefreshed?.();
      } finally {
        loading = false;
      }
      // Deltas that arrived during the request (or while it blocked a refresh) aren't reflected yet.
      if (!disposed && needsReconcile(get().sync)) scheduleRefresh();
    };

    const scheduleRefresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(true), settleMs);
    };

    return {
      sync: initialSyncState,
      replies: {},
      counts: {},

      start: () => void load(false),

      receive: (event) => {
        if (disposed) return;
        dispatch(event);
        if (event.type === "delta") scheduleRefresh();
      },

      requestDetails: (traceIds) => {
        replyLoader.request(traceIds);
        countLoader.request(traceIds);
      },

      retryReply: (traceId) => {
        set({ replies: omitKeys(get().replies, [traceId]) });
        replyLoader.request([traceId]);
      },

      dispose: () => {
        disposed = true;
        clearTimeout(timer);
      },
    };
  });

const omitKeys = <V>(record: Record<string, V>, keys: string[]) => {
  const next = { ...record };
  for (const key of keys) delete next[key];
  return next;
};
