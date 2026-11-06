"use client";

import { useParams } from "next/navigation";
import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { type TraceSpanCounts } from "@/lib/actions/traces/span-counts";
import { fetchApi } from "@/lib/api/fetch-api";
import { createBatchedLoader } from "@/lib/batched-loader";

interface TurnDataState {
  counts: Record<string, TraceSpanCounts>;
  fetchCounts: (traceIds: string[]) => void;
  /** Forget resolved counts (a live turn grew) so the next fetchCounts reloads them. */
  invalidateCounts: (traceIds: string[]) => void;
  /** Turns still receiving live updates: a missing reply there means "not written yet", not "none". */
  liveIds: Record<string, true>;
  setLive: (traceIds: string[], live: boolean) => void;
}

/**
 * Per-turn span counts the thread shows without loading span rows: fetched only for turns in
 * (or near) the viewport, batched and deduped. One store per mounted session view.
 */
const createTurnDataStore = (projectId: string) =>
  createStore<TurnDataState>()((set, get) => {
    const loader = createBatchedLoader<TraceSpanCounts>({
      // A background per-row load: failures stay unresolved (no toast) and retry when scrolled back into view.
      load: async (traceIds) => {
        const { data } = await fetchApi<Record<string, TraceSpanCounts>>(
          `/api/projects/${projectId}/traces/span-counts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ traceIds }),
          }
        );
        return data ?? undefined;
      },
      onLoaded: (counts) => set({ counts: { ...get().counts, ...counts } }),
      isResolved: (id) => id in get().counts,
    });

    return {
      counts: {},
      fetchCounts: loader.request,
      invalidateCounts: (traceIds) => {
        const next = { ...get().counts };
        for (const id of traceIds) delete next[id];
        set({ counts: next });
      },
      liveIds: {},
      setLive: (traceIds, live) => {
        const next = { ...get().liveIds };
        for (const id of traceIds) {
          if (live) next[id] = true;
          else delete next[id];
        }
        set({ liveIds: next });
      },
    };
  });

const TurnDataContext = createContext<StoreApi<TurnDataState> | null>(null);

export function TurnDataProvider({ children }: PropsWithChildren) {
  const { projectId } = useParams<{ projectId: string }>();
  const [store] = useState(() => createTurnDataStore(projectId));
  return <TurnDataContext.Provider value={store}>{children}</TurnDataContext.Provider>;
}

export function useTurnData<T>(selector: (state: TurnDataState) => T, equalityFn?: (a: T, b: T) => boolean): T {
  const store = useContext(TurnDataContext);
  if (!store) throw new Error("useTurnData must be used within TurnDataProvider");
  return useStoreWithEqualityFn(store, selector, equalityFn);
}
