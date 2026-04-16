import React, { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { persist } from "zustand/middleware";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { MAX_ZOOM, MIN_ZOOM } from "@/components/traces/trace-view/store";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import { type Filter } from "@/lib/actions/common/filters";
import { type SessionSpansTraceResult } from "@/lib/actions/sessions/search-spans";
import { type TraceRow } from "@/lib/traces/types";

export type SessionResizablePanel = "session" | "span";

type PanelWidthKey = "sessionPanelWidth" | "spanPanelWidth";
type PanelDef = { key: PanelWidthKey; min: number; default: number };

const ALL_PANELS: PanelDef[] = [
  { key: "sessionPanelWidth", min: 400, default: 520 },
  { key: "spanPanelWidth", min: 400, default: 405 },
];

export type SessionViewSelectedSpan = {
  traceId: string;
  spanId: string;
};

export type SessionSummary = {
  sessionId: string;
  // Optional aggregated stats (may be set from the table row when available).
  startTime?: string;
  endTime?: string;
  totalTokens?: number;
  totalCost?: number;
  traceCount?: number;
};

interface SessionViewState {
  // Session metadata
  session?: SessionSummary;

  // Project context (set by SessionViewContent on mount).
  projectId?: string;

  // Traces loaded upfront for this session.
  traces: TraceRow[];
  isTracesLoading: boolean;
  tracesError?: string;

  // Per-trace span data (lazy-loaded on expand).
  traceSpans: Record<string, TraceViewSpan[]>;
  traceSpansLoading: Record<string, boolean>;
  traceSpansError: Record<string, string | undefined>;

  // UI state
  expandedTraceIds: Set<string>;
  /** Namespaced `${traceId}::${groupId}` set — EXPANDED transcript groups (default collapsed). */
  transcriptExpandedGroups: Set<string>;

  // Session timeline
  sessionTimelineEnabled: boolean;
  sessionTimelineZoom: number;

  // Search state — non-null searchResults means a search is active.
  searchResults?: Record<string, SessionSpansTraceResult>;
  isSearchLoading: boolean;
  searchError?: string;

  // Selection & panel visibility
  selectedSpan?: SessionViewSelectedSpan;
  spanPanelOpen: boolean;

  // Panel widths
  sessionPanelWidth: number;
  spanPanelWidth: number;
  maxWidth: number;
}

interface SessionViewActions {
  setSession: (session?: SessionSummary) => void;
  setProjectId: (projectId?: string) => void;
  setTraces: (traces: TraceRow[]) => void;
  setIsTracesLoading: (loading: boolean) => void;
  setTracesError: (error?: string) => void;

  /** Fetch spans for a trace if not already loaded or currently loading.
   *  Idempotent: safe to call repeatedly on mount of TraceItem. */
  ensureTraceSpans: (trace: TraceRow) => Promise<void>;

  toggleTraceExpanded: (traceId: string) => void;
  setTraceExpanded: (traceId: string, expanded: boolean) => void;
  expandAllTraces: () => void;

  setTraceSpans: (traceId: string, spans: TraceViewSpan[]) => void;
  upsertTraceSpan: (traceId: string, span: TraceViewSpan) => void;
  setTraceSpansLoading: (traceId: string, loading: boolean) => void;
  setTraceSpansError: (traceId: string, error?: string) => void;

  toggleTranscriptGroup: (traceId: string, groupId: string) => void;

  setSessionTimelineEnabled: (enabled: boolean) => void;
  setSessionTimelineZoom: (zoom: number) => void;

  searchSessionSpans: (filters: Filter[], search: string) => Promise<void>;
  clearSearch: () => void;

  setSelectedSpan: (selection?: SessionViewSelectedSpan) => void;
  setSpanPanelOpen: (open: boolean) => void;

  resizePanel: (panel: SessionResizablePanel, delta: number) => void;
  setMaxWidth: (maxWidth: number) => void;
  fitPanelsToMaxWidth: () => void;
}

export type SessionViewStore = SessionViewState & SessionViewActions;

function getVisiblePanels(state: SessionViewStore): PanelDef[] {
  const result: PanelDef[] = [ALL_PANELS[0]]; // session always visible
  if (state.spanPanelOpen) result.push(ALL_PANELS[1]);
  return result;
}

/** Distribute deficit across visible panels. Mirrored from trace-view store. */
function distributeDeficit(
  state: SessionViewStore,
  visiblePanels: PanelDef[],
  deficit: number
): Partial<SessionViewState> {
  const updates: Partial<SessionViewState> = {};
  const budgets = visiblePanels.map((p) => ({
    key: p.key,
    min: p.min,
    width: state[p.key],
    budget: state[p.key] - p.min,
  }));
  const totalBudget = budgets.reduce((sum, b) => sum + b.budget, 0);

  if (totalBudget > 0) {
    let remaining = deficit;
    for (const b of budgets) {
      const share = Math.min(b.budget, Math.round(deficit * (b.budget / totalBudget)));
      const actual = Math.min(share, remaining);
      updates[b.key] = b.width - actual;
      remaining -= actual;
    }
    if (remaining > 0) {
      for (let i = budgets.length - 1; i >= 0 && remaining > 0; i--) {
        const b = budgets[i];
        const current = (updates[b.key] as number) ?? b.width;
        const absorb = Math.min(remaining, current - b.min);
        updates[b.key] = current - absorb;
        remaining -= absorb;
      }
    }
  } else {
    const totalWidth = budgets.reduce((sum, b) => sum + b.width, 0);
    if (totalWidth <= 0) return updates;
    let remaining = deficit;
    for (const b of budgets) {
      const share = Math.round(deficit * (b.width / totalWidth));
      const actual = Math.min(share, remaining);
      updates[b.key] = b.width - actual;
      remaining -= actual;
    }
    if (remaining > 0) {
      const last = budgets[budgets.length - 1];
      updates[last.key] = ((updates[last.key] as number) ?? last.width) - remaining;
    }
  }

  return updates;
}

const inFlightTraceIds = new Set<string>();

const createSessionViewStore = (options?: { initialSession?: SessionSummary; storeKey?: string }) =>
  createStore<SessionViewStore>()(
    persist(
      (set, get) => ({
        session: options?.initialSession,
        traces: [],
        isTracesLoading: false,
        tracesError: undefined,

        traceSpans: {},
        traceSpansLoading: {},
        traceSpansError: {},

        expandedTraceIds: new Set<string>(),
        transcriptExpandedGroups: new Set<string>(),

        sessionTimelineEnabled: false,
        sessionTimelineZoom: 1,

        searchResults: undefined,
        isSearchLoading: false,
        searchError: undefined,

        selectedSpan: undefined,
        spanPanelOpen: false,

        sessionPanelWidth: ALL_PANELS[0].default,
        spanPanelWidth: ALL_PANELS[1].default,
        maxWidth: Infinity,

        setSession: (session) => set({ session }),
        setProjectId: (projectId) => set({ projectId }),
        setTraces: (traces) => set({ traces }),
        setIsTracesLoading: (isTracesLoading) => set({ isTracesLoading }),
        setTracesError: (tracesError) => set({ tracesError }),

        ensureTraceSpans: async (trace) => {
          const { projectId } = get();
          if (!projectId) return;
          if (inFlightTraceIds.has(trace.id) || get().traceSpans[trace.id]) return;
          inFlightTraceIds.add(trace.id);

          set((s) => ({
            traceSpansLoading: { ...s.traceSpansLoading, [trace.id]: true },
            traceSpansError: { ...s.traceSpansError, [trace.id]: undefined },
          }));

          try {
            const params = new URLSearchParams();
            params.append("searchIn", "input");
            params.append("searchIn", "output");
            const startDate = new Date(new Date(trace.startTime).getTime() - 1000).toISOString();
            const endDate = new Date(new Date(trace.endTime).getTime() + 1000).toISOString();
            params.set("startDate", startDate);
            params.set("endDate", endDate);

            const url = `/api/projects/${projectId}/traces/${trace.id}/spans?${params.toString()}`;
            const res = await fetch(url);
            if (!res.ok) {
              const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
              set((s) => ({
                traceSpansError: { ...s.traceSpansError, [trace.id]: err.error || "Failed to load spans" },
              }));
              return;
            }
            const body = (await res.json()) as { spans: TraceViewSpan[] };
            const enriched = enrichSpansWithPending(body.spans);
            set((s) => ({
              traceSpans: { ...s.traceSpans, [trace.id]: enriched },
            }));
          } catch (e) {
            set((s) => ({
              traceSpansError: {
                ...s.traceSpansError,
                [trace.id]: e instanceof Error ? e.message : "Failed to load spans",
              },
            }));
          } finally {
            inFlightTraceIds.delete(trace.id);
            set((s) => ({
              traceSpansLoading: { ...s.traceSpansLoading, [trace.id]: false },
            }));
          }
        },

        // Any transition to `expanded=true` also kicks off span loading (idempotent
        // via `ensureTraceSpans`'s internal dedupe). Callers — user click, URL
        // span resolver, programmatic — never need to remember this.
        toggleTraceExpanded: (traceId) => {
          const state = get();
          const prev = state.expandedTraceIds;
          const next = new Set(prev);
          const willExpand = !next.has(traceId);
          if (willExpand) next.add(traceId);
          else next.delete(traceId);
          set({ expandedTraceIds: next });

          if (willExpand) {
            const trace = state.traces.find((t) => t.id === traceId);
            if (trace) void get().ensureTraceSpans(trace);
          }
        },
        setTraceExpanded: (traceId, expanded) => {
          const state = get();
          const prev = state.expandedTraceIds;
          if (expanded === prev.has(traceId)) return;
          const next = new Set(prev);
          if (expanded) next.add(traceId);
          else next.delete(traceId);
          set({ expandedTraceIds: next });

          if (expanded) {
            const trace = state.traces.find((t) => t.id === traceId);
            if (trace) void get().ensureTraceSpans(trace);
          }
        },
        expandAllTraces: () => {
          const state = get();
          const all = new Set(state.traces.map((t) => t.id));
          set({ expandedTraceIds: all });
          for (const trace of state.traces) {
            void get().ensureTraceSpans(trace);
          }
        },

        setTraceSpans: (traceId, spans) => set((state) => ({ traceSpans: { ...state.traceSpans, [traceId]: spans } })),
        upsertTraceSpan: (traceId, span) =>
          set((state) => {
            const existing = state.traceSpans[traceId] ?? [];
            const idx = existing.findIndex((s) => s.spanId === span.spanId);
            const next = idx === -1 ? [...existing, span] : existing.map((s) => (s.spanId === span.spanId ? span : s));
            return { traceSpans: { ...state.traceSpans, [traceId]: next } };
          }),
        setTraceSpansLoading: (traceId, loading) =>
          set((state) => ({ traceSpansLoading: { ...state.traceSpansLoading, [traceId]: loading } })),
        setTraceSpansError: (traceId, error) =>
          set((state) => ({ traceSpansError: { ...state.traceSpansError, [traceId]: error } })),

        toggleTranscriptGroup: (traceId, groupId) => {
          const key = `${traceId}::${groupId}`;
          const prev = get().transcriptExpandedGroups;
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          set({ transcriptExpandedGroups: next });
        },

        setSessionTimelineEnabled: (enabled) => set({ sessionTimelineEnabled: enabled }),
        setSessionTimelineZoom: (zoom) => set({ sessionTimelineZoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) }),

        setSelectedSpan: (selectedSpan) => {
          set({ selectedSpan, spanPanelOpen: !!selectedSpan });
          get().fitPanelsToMaxWidth();
        },

        setSpanPanelOpen: (open) => {
          set({ spanPanelOpen: open });
          if (!open) set({ selectedSpan: undefined });
          get().fitPanelsToMaxWidth();
        },

        searchSessionSpans: async (filters, search) => {
          const state = get();
          const { projectId, session } = state;
          if (!projectId || !session?.sessionId) return;

          set({ isSearchLoading: true, searchError: undefined });

          try {
            const params = new URLSearchParams();
            if (search) params.set("search", search);
            params.append("searchIn", "input");
            params.append("searchIn", "output");
            for (const f of filters) params.append("filter", JSON.stringify(f));

            const url = `/api/projects/${projectId}/sessions/${session.sessionId}/spans?${params.toString()}`;
            const res = await fetch(url);
            if (!res.ok) {
              const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
              set({ searchError: err.error || "Search failed", isSearchLoading: false });
              return;
            }

            const body = (await res.json()) as { traces: SessionSpansTraceResult[] };

            const results: Record<string, SessionSpansTraceResult> = {};
            for (const t of body.traces) results[t.traceId] = t;

            set({ searchResults: results, isSearchLoading: false });
          } catch (e) {
            set({
              searchError: e instanceof Error ? e.message : "Search failed",
              isSearchLoading: false,
            });
          }
        },

        clearSearch: () => {
          set({ searchResults: undefined, isSearchLoading: false, searchError: undefined });
        },

        setMaxWidth: (maxWidth) => {
          const current = get().maxWidth;
          if (Math.abs(maxWidth - current) < 1) return;
          set({ maxWidth });
          get().fitPanelsToMaxWidth();
        },

        fitPanelsToMaxWidth: () => {
          const state = get();
          if (state.maxWidth === Infinity) return;

          const visible = getVisiblePanels(state);
          const total = visible.reduce((sum, p) => sum + state[p.key], 0);
          if (total <= state.maxWidth) return;

          const deficit = total - state.maxWidth;
          const updates = distributeDeficit(state, visible, deficit);
          set(updates as Partial<SessionViewStore>);
        },

        resizePanel: (panel, delta) => {
          const state = get();
          const visible = getVisiblePanels(state);

          const targetKey = `${panel}PanelWidth` as PanelWidthKey;
          const startIndex = visible.findIndex((p) => p.key === targetKey);
          if (startIndex === -1) return;

          const updates: Partial<SessionViewState> = {};

          if (delta > 0) {
            const newTargetWidth = state[targetKey] + delta;
            updates[targetKey] = newTargetWidth;

            let total = 0;
            for (const p of visible) {
              total += (updates[p.key] as number) ?? state[p.key];
            }

            let overflow = total - state.maxWidth;
            if (overflow > 0) {
              for (let i = startIndex - 1; i >= 0 && overflow > 0; i--) {
                const { key, min } = visible[i];
                const current = (updates[key] as number) ?? state[key];
                const shrinkable = Math.max(0, current - min);
                const shrinkAmount = Math.min(shrinkable, overflow);
                updates[key] = current - shrinkAmount;
                overflow -= shrinkAmount;
              }
              if (overflow > 0) {
                updates[targetKey] = (updates[targetKey] as number) - overflow;
              }
            }
          } else if (delta < 0) {
            let remaining = delta;
            for (let i = startIndex; i < visible.length && remaining < 0; i++) {
              const { key, min } = visible[i];
              const current = state[key];
              const newWidth = Math.max(min, current + remaining);
              updates[key] = newWidth;
              remaining -= newWidth - current;
            }
          }

          set(updates as Partial<SessionViewStore>);
        },
      }),
      {
        name: options?.storeKey ?? "session-view-state",
        partialize: (state) => ({
          sessionPanelWidth: state.sessionPanelWidth,
          spanPanelWidth: state.spanPanelWidth,
          sessionTimelineEnabled: state.sessionTimelineEnabled,
          sessionTimelineZoom: state.sessionTimelineZoom,
        }),
        merge: (persistedState, currentState) => {
          const persisted = (persistedState ?? {}) as Record<string, unknown>;
          return {
            ...currentState,
            ...(typeof persisted.sessionPanelWidth === "number" && { sessionPanelWidth: persisted.sessionPanelWidth }),
            ...(typeof persisted.spanPanelWidth === "number" && { spanPanelWidth: persisted.spanPanelWidth }),
            ...(typeof persisted.sessionTimelineEnabled === "boolean" && {
              sessionTimelineEnabled: persisted.sessionTimelineEnabled,
            }),
            ...(typeof persisted.sessionTimelineZoom === "number" && {
              sessionTimelineZoom: persisted.sessionTimelineZoom,
            }),
          };
        },
      }
    )
  );

const SessionViewStoreContext = createContext<StoreApi<SessionViewStore> | undefined>(undefined);

interface SessionViewStoreProviderProps {
  initialSession?: SessionSummary;
  storeKey?: string;
}

const SessionViewStoreProvider = ({
  children,
  initialSession,
  storeKey,
}: PropsWithChildren<SessionViewStoreProviderProps>) => {
  const [storeState] = useState(() => createSessionViewStore({ initialSession, storeKey }));

  return React.createElement(SessionViewStoreContext.Provider, { value: storeState }, children);
};

export const useSessionViewStore = <T>(
  selector: (store: SessionViewStore) => T,
  equalityFn?: (a: T, b: T) => boolean
): T => {
  const store = useContext(SessionViewStoreContext);
  if (!store) {
    throw new Error("useSessionViewStore must be used within a SessionViewStoreProvider");
  }
  return useStoreWithEqualityFn(store, selector, equalityFn);
};

export const useSessionViewStoreRaw = () => {
  const store = useContext(SessionViewStoreContext);
  if (!store) {
    throw new Error("useSessionViewStoreRaw must be used within a SessionViewStoreProvider");
  }
  return store;
};

export default SessionViewStoreProvider;
