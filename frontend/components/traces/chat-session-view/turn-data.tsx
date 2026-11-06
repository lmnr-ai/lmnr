"use client";

import { useParams } from "next/navigation";
import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { type TraceSpanCounts } from "@/lib/actions/traces/span-counts";
import { fetchApi } from "@/lib/api/fetch-api";

// Server caps each counts request at 100 trace ids.
const BATCH = 100;
const DEBOUNCE_MS = 150;

interface TurnDataState {
  counts: Record<string, TraceSpanCounts>;
  fetchCounts: (traceIds: string[]) => void;
  /** Forget resolved counts (a live turn grew) so the next fetchCounts reloads them. */
  invalidateCounts: (traceIds: string[]) => void;
}

/**
 * Per-turn span counts the thread shows without loading span rows: fetched only for turns in
 * (or near) the viewport, batched and deduped. One store per mounted session view.
 */
const createTurnDataStore = (projectId: string) =>
  createStore<TurnDataState>()((set, get) => {
    const inFlight = new Set<string>();
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = async () => {
      const ids = [...pending];
      pending.clear();
      for (const id of ids) inFlight.add(id);
      for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH);
        // A background per-row load: failures stay unresolved (no toast) and retry when scrolled back into view.
        const { data } = await fetchApi<Record<string, TraceSpanCounts>>(
          `/api/projects/${projectId}/traces/span-counts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ traceIds: chunk }),
          }
        );
        if (data) set({ counts: { ...get().counts, ...data } });
        for (const id of chunk) inFlight.delete(id);
      }
    };

    return {
      counts: {},
      fetchCounts: (traceIds) => {
        const resolved = get().counts;
        const fresh = traceIds.filter((id) => !(id in resolved) && !inFlight.has(id) && !pending.has(id));
        if (fresh.length === 0) return;
        for (const id of fresh) pending.add(id);
        clearTimeout(timer);
        timer = setTimeout(() => void flush(), DEBOUNCE_MS);
      },
      invalidateCounts: (traceIds) => {
        const next = { ...get().counts };
        for (const id of traceIds) delete next[id];
        set({ counts: next });
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
