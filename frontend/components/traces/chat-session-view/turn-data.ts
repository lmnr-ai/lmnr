import { create } from "zustand";

import { type ModelTokens, type TraceSpanCounts } from "@/lib/actions/traces/span-counts";

// Server caps each counts request at 100 trace ids.
const BATCH = 100;
const DEBOUNCE_MS = 150;

interface TurnDataState {
  counts: Record<string, TraceSpanCounts>;
  /** Token share per model for a session, keyed by the joined trace ids it was computed from. */
  models: { key: string; items: ModelTokens[] } | null;
  fetchCounts: (projectId: string, traceIds: string[]) => void;
  fetchModels: (projectId: string, traceIds: string[]) => Promise<void>;
}

/**
 * Per-turn aggregates the thread shows without loading span rows: counts are
 * fetched only for turns in (or near) the viewport, batched and deduped.
 */
export const useTurnDataStore = create<TurnDataState>()((set, get) => {
  const inFlight = new Set<string>();
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let modelsRequest: { key: string; controller: AbortController } | undefined;

  const flush = async (projectId: string) => {
    const ids = [...pending];
    pending.clear();
    for (const id of ids) inFlight.add(id);
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      try {
        const res = await fetch(`/api/projects/${projectId}/traces/span-counts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ traceIds: chunk }),
        });
        if (!res.ok) throw new Error("Failed to fetch span counts");
        const data = (await res.json()) as Record<string, TraceSpanCounts>;
        set({ counts: { ...get().counts, ...data } });
      } catch {
        // Leave them unresolved: scrolling them back into view retries.
      } finally {
        for (const id of chunk) inFlight.delete(id);
      }
    }
  };

  return {
    counts: {},
    models: null,
    fetchCounts: (projectId, traceIds) => {
      const resolved = get().counts;
      const fresh = traceIds.filter((id) => !(id in resolved) && !inFlight.has(id) && !pending.has(id));
      if (fresh.length === 0) return;
      for (const id of fresh) pending.add(id);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(projectId), DEBOUNCE_MS);
    },
    fetchModels: async (projectId, traceIds) => {
      const key = traceIds.join(",");
      if (get().models?.key === key || modelsRequest?.key === key) return;
      // A newer session's request supersedes the old one, so a slow stale response can't overwrite it.
      modelsRequest?.controller.abort();
      const request = { key, controller: new AbortController() };
      modelsRequest = request;
      try {
        const res = await fetch(`/api/projects/${projectId}/traces/model-tokens`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ traceIds }),
          signal: request.controller.signal,
        });
        if (!res.ok) throw new Error("Failed to fetch model tokens");
        const items = (await res.json()) as ModelTokens[];
        if (modelsRequest === request) set({ models: { key, items } });
      } catch {
        // The pill is optional: on failure it stays hidden rather than retrying in a loop.
        if (modelsRequest === request) set({ models: { key, items: [] } });
      } finally {
        if (modelsRequest === request) modelsRequest = undefined;
      }
    },
  };
});
