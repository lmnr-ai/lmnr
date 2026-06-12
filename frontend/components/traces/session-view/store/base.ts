import { createContext, useContext } from "react";
import { type StoreApi } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { MAX_ZOOM, MIN_ZOOM } from "@/components/traces/trace-view/store";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
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

export interface BaseSessionViewState {
  // Project context (set by content component on mount).
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

  /** Per-trace view mode. Absent → "transcript" (default). Not persisted. */
  traceViewModes: Record<string, "tree" | "transcript">;
  /** Per-trace LLM-content visibility in tree mode. Absent → true (default). Not persisted. */
  traceShowTreeContent: Record<string, boolean>;

  /** Per-trace condensed-timeline open/closed state. Toggled by the control-bar
   *  button and the in-timeline X. Debugger-only at the render layer. Not persisted. */
  timelineOpenTraceIds: Set<string>;
  /** Per-trace condensed-timeline zoom. Absent → MIN_ZOOM. Not persisted. */
  condensedTimelineZoomByTrace: Record<string, number>;
  /** Per-trace drag-selected visible span ids (with ancestors). Absent → empty. Not persisted. */
  condensedTimelineVisibleSpanIdsByTrace: Record<string, Set<string>>;
  /** Shared cost-heatmap toggle across all cards' timelines. Not persisted. */
  isCostHeatmapVisible: boolean;

  /** One-shot scroll request: timeline click → panel list scrolls to group header. */
  scrollToGroup: { traceId: string; groupId: string } | null;
  /** One-shot scroll request: a trace was collapsed → scroll its header into view. */
  scrollToTraceId: string | null;

  // Absolute-ms (start, end) covering the times of rows currently visible in
  // the session panel virtualizer.
  scrollStartTime?: number;
  scrollEndTime?: number;

  // Search state — non-null searchResults means a search is active. STATE ONLY;
  // the fetch action (searchSessionSpans) is session-concrete.
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

export interface BaseSessionViewActions {
  setProjectId: (projectId?: string) => void;
  setTraces: (traces: TraceRow[] | ((prev: TraceRow[]) => TraceRow[])) => void;
  setIsTracesLoading: (loading: boolean) => void;
  setTracesError: (error?: string) => void;

  /** Fetch spans for a trace if not already loaded or currently loading.
   *  Idempotent: safe to call repeatedly on mount of TraceItem. */
  fetchTraceSpans: (trace: TraceRow) => Promise<void>;

  toggleTraceExpanded: (traceId: string) => void;
  setTraceExpanded: (traceId: string, expanded: boolean) => void;
  expandAllTraces: () => void;

  setTraceSpans: (traceId: string, spans: TraceViewSpan[]) => void;
  upsertTraceSpan: (traceId: string, span: TraceViewSpan) => void;
  setTraceSpansLoading: (traceId: string, loading: boolean) => void;
  setTraceSpansError: (traceId: string, error?: string) => void;

  toggleTranscriptGroup: (traceId: string, groupId: string) => void;
  requestScrollToGroup: (traceId: string, groupId: string) => void;
  consumeScrollToGroup: () => void;
  consumeScrollToTrace: () => void;

  setTraceViewMode: (traceId: string, mode: "tree" | "transcript") => void;
  toggleTraceShowTreeContent: (traceId: string) => void;

  toggleTimelineOpen: (traceId: string) => void;
  setTimelineOpen: (traceId: string, open: boolean) => void;
  setCondensedTimelineZoom: (traceId: string, zoom: number) => void;
  setCondensedTimelineVisibleSpanIds: (traceId: string, ids: Set<string>) => void;
  clearCondensedTimelineSelection: (traceId: string) => void;
  setIsCostHeatmapVisible: (visible: boolean) => void;
  /** Flip `collapsed` on one span inside a trace's span array. Writes a NEW
   *  array identity so flat-row useMemos keyed on traceSpans recompute. */
  toggleSpanCollapse: (traceId: string, spanId: string) => void;

  setScrollTimeRange: (start?: number, end?: number) => void;

  setSelectedSpan: (selection?: SessionViewSelectedSpan) => void;
  setSpanPanelOpen: (open: boolean) => void;

  resizePanel: (panel: SessionResizablePanel, delta: number) => void;
  setMaxWidth: (maxWidth: number) => void;
  fitPanelsToMaxWidth: () => void;
}

export type BaseSessionViewStore = BaseSessionViewState & BaseSessionViewActions;

function getVisiblePanels(state: BaseSessionViewStore): PanelDef[] {
  const result: PanelDef[] = [ALL_PANELS[0]]; // session always visible
  if (state.spanPanelOpen) result.push(ALL_PANELS[1]);
  return result;
}

/** Distribute deficit across visible panels. Mirrored from trace-view store. */
function distributeDeficit(
  state: BaseSessionViewStore,
  visiblePanels: PanelDef[],
  deficit: number
): Partial<BaseSessionViewState> {
  const updates: Partial<BaseSessionViewState> = {};
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

/**
 * Base session-view slice shared by the regular session view and the debugger
 * session view. Generic over the final store type `T` so derived stores can
 * spread it and override actions (open recursion via `get()`). The `as Partial<T>`
 * casts on every `set` are expected — mirrors `createBaseTraceViewSlice`.
 */
export function createBaseSessionViewSlice<T extends BaseSessionViewStore>(
  set: (partial: T | Partial<T> | ((state: T) => T | Partial<T>)) => void,
  get: () => T,
  // No options needed today; keep the signature for parity with trace-view's base.
  _options?: Record<string, never>
): BaseSessionViewStore {
  return {
    traces: [],
    isTracesLoading: false,
    tracesError: undefined,

    traceSpans: {},
    traceSpansLoading: {},
    traceSpansError: {},

    expandedTraceIds: new Set<string>(),
    transcriptExpandedGroups: new Set<string>(),
    traceViewModes: {},
    traceShowTreeContent: {},
    timelineOpenTraceIds: new Set<string>(),
    condensedTimelineZoomByTrace: {},
    condensedTimelineVisibleSpanIdsByTrace: {},
    isCostHeatmapVisible: false,
    scrollToGroup: null,
    scrollToTraceId: null,

    scrollStartTime: undefined,
    scrollEndTime: undefined,

    searchResults: undefined,
    isSearchLoading: false,
    searchError: undefined,

    selectedSpan: undefined,
    spanPanelOpen: false,

    sessionPanelWidth: ALL_PANELS[0].default,
    spanPanelWidth: ALL_PANELS[1].default,
    maxWidth: Infinity,

    setProjectId: (projectId) => set({ projectId } as Partial<T>),
    setTraces: (traces) => {
      if (typeof traces === "function") {
        set({ traces: traces(get().traces) } as Partial<T>);
      } else {
        set({ traces } as Partial<T>);
      }
    },
    setIsTracesLoading: (isTracesLoading) => set({ isTracesLoading } as Partial<T>),
    setTracesError: (tracesError) => set({ tracesError } as Partial<T>),

    fetchTraceSpans: async (trace) => {
      const state = get();
      const { projectId } = state;
      if (!projectId) return;
      if (state.traceSpans[trace.id] || state.traceSpansLoading[trace.id]) return;

      set({
        traceSpansLoading: { ...get().traceSpansLoading, [trace.id]: true },
        traceSpansError: { ...get().traceSpansError, [trace.id]: undefined },
      } as Partial<T>);

      try {
        const params = new URLSearchParams();
        const startDate = new Date(new Date(trace.startTime).getTime() - 1000).toISOString();
        const endDate = new Date(new Date(trace.endTime).getTime() + 1000).toISOString();
        params.set("startDate", startDate);
        params.set("endDate", endDate);

        const url = `/api/projects/${projectId}/traces/${trace.id}/spans?${params.toString()}`;
        const res = await fetch(url);
        if (!res.ok) {
          const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
          set({
            traceSpansError: { ...get().traceSpansError, [trace.id]: err.error || "Failed to load spans" },
          } as Partial<T>);
          return;
        }
        const spans = (await res.json()) as TraceViewSpan[];
        const enriched = enrichSpansWithPending(spans);
        set({
          traceSpans: { ...get().traceSpans, [trace.id]: enriched },
        } as Partial<T>);
      } catch (e) {
        set({
          traceSpansError: {
            ...get().traceSpansError,
            [trace.id]: e instanceof Error ? e.message : "Failed to load spans",
          },
        } as Partial<T>);
      } finally {
        set({
          traceSpansLoading: { ...get().traceSpansLoading, [trace.id]: false },
        } as Partial<T>);
      }
    },

    // open recursion: delegates to get().fetchTraceSpans — a derived store's override wins.
    // Any transition to `expanded=true` also kicks off span loading (idempotent
    // via `fetchTraceSpans`'s internal dedupe).
    toggleTraceExpanded: (traceId) => {
      const state = get();
      const prev = state.expandedTraceIds;
      const next = new Set(prev);
      const willExpand = !next.has(traceId);
      if (willExpand) next.add(traceId);
      else next.delete(traceId);
      // On COLLAPSE, request a scroll-to-header so a deeply-scrolled trace doesn't
      // strand the viewport. (Expand scrolls via selection/normal flow already.)
      set({ expandedTraceIds: next, ...(willExpand ? {} : { scrollToTraceId: traceId }) } as Partial<T>);

      if (willExpand) {
        const trace = state.traces.find((t) => t.id === traceId);
        if (trace) void get().fetchTraceSpans(trace);
      }
    },
    // open recursion: delegates to get().fetchTraceSpans — a derived store's override wins.
    setTraceExpanded: (traceId, expanded) => {
      const state = get();
      const prev = state.expandedTraceIds;
      if (expanded === prev.has(traceId)) return;
      const next = new Set(prev);
      if (expanded) next.add(traceId);
      else next.delete(traceId);
      set({ expandedTraceIds: next } as Partial<T>);

      if (expanded) {
        const trace = state.traces.find((t) => t.id === traceId);
        if (trace) void get().fetchTraceSpans(trace);
      }
    },
    // open recursion: delegates to get().fetchTraceSpans — a derived store's override wins.
    expandAllTraces: () => {
      const state = get();
      const all = new Set(state.traces.map((t) => t.id));
      set({ expandedTraceIds: all } as Partial<T>);
      for (const trace of state.traces) {
        void get().fetchTraceSpans(trace);
      }
    },

    setTraceSpans: (traceId, spans) => set({ traceSpans: { ...get().traceSpans, [traceId]: spans } } as Partial<T>),
    upsertTraceSpan: (traceId, span) => {
      const existing = get().traceSpans[traceId] ?? [];
      const idx = existing.findIndex((s) => s.spanId === span.spanId);
      const next = idx === -1 ? [...existing, span] : existing.map((s) => (s.spanId === span.spanId ? span : s));
      set({ traceSpans: { ...get().traceSpans, [traceId]: next } } as Partial<T>);
    },
    setTraceSpansLoading: (traceId, loading) =>
      set({ traceSpansLoading: { ...get().traceSpansLoading, [traceId]: loading } } as Partial<T>),
    setTraceSpansError: (traceId, error) =>
      set({ traceSpansError: { ...get().traceSpansError, [traceId]: error } } as Partial<T>),

    toggleTranscriptGroup: (traceId, groupId) => {
      const key = `${traceId}::${groupId}`;
      const prev = get().transcriptExpandedGroups;
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      set({ transcriptExpandedGroups: next } as Partial<T>);
    },

    requestScrollToGroup: (traceId, groupId) => set({ scrollToGroup: { traceId, groupId } } as Partial<T>),
    consumeScrollToGroup: () => {
      if (get().scrollToGroup !== null) set({ scrollToGroup: null } as Partial<T>);
    },
    consumeScrollToTrace: () => {
      if (get().scrollToTraceId !== null) set({ scrollToTraceId: null } as Partial<T>);
    },

    setTraceViewMode: (traceId, mode) =>
      set({ traceViewModes: { ...get().traceViewModes, [traceId]: mode } } as Partial<T>),
    toggleTraceShowTreeContent: (traceId) => {
      const current = get().traceShowTreeContent[traceId] ?? true;
      set({ traceShowTreeContent: { ...get().traceShowTreeContent, [traceId]: !current } } as Partial<T>);
    },

    toggleTimelineOpen: (traceId) => {
      const next = new Set(get().timelineOpenTraceIds);
      if (next.has(traceId)) next.delete(traceId);
      else next.add(traceId);
      set({ timelineOpenTraceIds: next } as Partial<T>);
    },
    setTimelineOpen: (traceId, open) => {
      const prev = get().timelineOpenTraceIds;
      if (open === prev.has(traceId)) return;
      const next = new Set(prev);
      if (open) next.add(traceId);
      else next.delete(traceId);
      set({ timelineOpenTraceIds: next } as Partial<T>);
    },
    setCondensedTimelineZoom: (traceId, zoom) =>
      set({
        condensedTimelineZoomByTrace: {
          ...get().condensedTimelineZoomByTrace,
          [traceId]: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)),
        },
      } as Partial<T>),
    setCondensedTimelineVisibleSpanIds: (traceId, ids) =>
      set({
        condensedTimelineVisibleSpanIdsByTrace: {
          ...get().condensedTimelineVisibleSpanIdsByTrace,
          [traceId]: ids,
        },
      } as Partial<T>),
    clearCondensedTimelineSelection: (traceId) =>
      set({
        condensedTimelineVisibleSpanIdsByTrace: {
          ...get().condensedTimelineVisibleSpanIdsByTrace,
          [traceId]: new Set(),
        },
      } as Partial<T>),
    setIsCostHeatmapVisible: (visible) => set({ isCostHeatmapVisible: visible } as Partial<T>),
    toggleSpanCollapse: (traceId, spanId) => {
      const spans = get().traceSpans[traceId];
      if (!spans) return;
      const next = spans.map((s) => (s.spanId === spanId ? { ...s, collapsed: !s.collapsed } : s));
      set({ traceSpans: { ...get().traceSpans, [traceId]: next } } as Partial<T>);
    },

    setScrollTimeRange: (start, end) => set({ scrollStartTime: start, scrollEndTime: end } as Partial<T>),

    // open recursion: delegates to get().fitPanelsToMaxWidth — a derived store's override wins.
    setSelectedSpan: (selectedSpan) => {
      set({ selectedSpan, spanPanelOpen: !!selectedSpan } as Partial<T>);
      get().fitPanelsToMaxWidth();
    },

    // open recursion: delegates to get().fitPanelsToMaxWidth — a derived store's override wins.
    setSpanPanelOpen: (open) => {
      set({ spanPanelOpen: open } as Partial<T>);
      if (!open) set({ selectedSpan: undefined } as Partial<T>);
      get().fitPanelsToMaxWidth();
    },

    // open recursion: delegates to get().fitPanelsToMaxWidth — a derived store's override wins.
    setMaxWidth: (maxWidth) => {
      const current = get().maxWidth;
      if (Math.abs(maxWidth - current) < 1) return;
      set({ maxWidth } as Partial<T>);
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
      set(updates as Partial<T>);
    },

    resizePanel: (panel, delta) => {
      const state = get();
      const visible = getVisiblePanels(state);

      const targetKey = `${panel}PanelWidth` as PanelWidthKey;
      const startIndex = visible.findIndex((p) => p.key === targetKey);
      if (startIndex === -1) return;

      const updates: Partial<BaseSessionViewState> = {};

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

      set(updates as Partial<T>);
    },
  };
}

export const SessionViewContext = createContext<StoreApi<BaseSessionViewStore> | undefined>(undefined);

export const useSessionViewBaseStore = <T>(
  selector: (store: BaseSessionViewStore) => T,
  equalityFn?: (a: T, b: T) => boolean
): T => {
  const store = useContext(SessionViewContext);
  if (!store) {
    throw new Error("useSessionViewBaseStore must be used within a SessionViewContext provider");
  }
  return useStoreWithEqualityFn(store, selector, equalityFn);
};

export const useSessionViewBaseStoreRaw = () => {
  const store = useContext(SessionViewContext);
  if (!store) {
    throw new Error("useSessionViewBaseStoreRaw must be used within a SessionViewContext provider");
  }
  return store;
};

// Re-export from trace-view base so consumers can import zoom bounds via the
// session-view store barrel (the concrete store still needs them for the timeline).
export { MAX_ZOOM, MIN_ZOOM };
