import { clamp, has } from "lodash";
import { createContext, type PropsWithChildren, useContext, useRef } from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import { persist } from "zustand/middleware";

import {
  buildSpanNameMap,
  computePathInfoMap,
  type CondensedTimelineData,
  groupIntoSections,
  type MinimapSpan,
  type TimelineData,
  transformSpansToCondensedTimeline,
  transformSpansToFlatMinimap,
  transformSpansToMinimap,
  transformSpansToTimeline,
  transformSpansToTree,
  type TreeSpan,
} from "@/components/traces/trace-view/trace-view-store-utils.ts";
import { type Event } from "@/lib/events/types";
import { SPAN_KEYS } from "@/lib/lang-graph/types";
import { type SpanType } from "@/lib/traces/types";

export const MAX_ZOOM = 18;
export const MIN_ZOOM = 1;
export const ZOOM_INCREMENT = 0.5;
export const MIN_TREE_VIEW_WIDTH = 500;

export type TraceViewSpan = {
  spanId: string;
  parentSpanId?: string;
  traceId: string;
  name: string;
  startTime: string;
  endTime: string;
  attributes: Record<string, any>;
  spanType: SpanType;
  path: string;
  events: Event[];
  status?: string;
  model?: string;
  pending?: boolean;
  collapsed: boolean;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadInputTokens?: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  aggregatedMetrics?: {
    totalCost: number;
    totalTokens: number;
    cacheReadInputTokens?: number;
    hasLLMDescendants: boolean;
  };
};

export type TraceViewListSpan = {
  spanId: string;
  parentSpanId?: string;
  spanType: SpanType;
  name: string;
  model?: string;
  startTime: string;
  endTime: string;
  totalTokens: number;
  cacheReadInputTokens?: number;
  totalCost: number;
  pending?: boolean;
  pathInfo: {
    display: Array<{ spanId: string; name: string; count?: number }>;
    full: Array<{ spanId: string; name: string }>;
  } | null;
};

export type TraceViewTrace = {
  id: string;
  startTime: string;
  endTime: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadInputTokens?: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  metadata: string;
  status: string;
  traceType: string;
  visibility: "public" | "private";
  hasBrowserSession: boolean;
};

interface TraceViewStoreState {
  trace?: TraceViewTrace;
  isTraceLoading: boolean;
  traceError?: string;
  spans: TraceViewSpan[];
  spanPath: string[] | null;
  isSpansLoading: boolean;
  spansError?: string;
  selectedSpan?: TraceViewSpan;
  browserSession: boolean;
  langGraph: boolean;
  sessionTime?: number;
  tab: "tree" | "chat" | "reader";
  treeWidth: number;
  hasBrowserSession: boolean;
  spanTemplates: Record<string, string>;
  spanPathCounts: Map<string, number>; // Track count per span path for rollout sessions
  showTreeContent: boolean;
  // Condensed timeline state
  condensedTimelineEnabled: boolean;
  condensedTimelineVisibleSpanIds: Set<string>; // selected + ancestors (pre-computed)
  condensedTimelineZoom: number;
}

interface TraceViewStoreActions {
  setTrace: (trace?: TraceViewTrace | ((prevTrace?: TraceViewTrace) => TraceViewTrace | undefined)) => void;
  setTraceError: (error?: string) => void;
  setSpans: (spans: TraceViewSpan[] | ((prevSpans: TraceViewSpan[]) => TraceViewSpan[])) => void;
  setSpansError: (error?: string) => void;
  setIsTraceLoading: (isTraceLoading: boolean) => void;
  setIsSpansLoading: (isSpansLoading: boolean) => void;
  setSelectedSpan: (span?: TraceViewSpan) => void;
  selectSpanById: (spanId: string) => void;
  setSpanPath: (spanPath: string[]) => void;
  setBrowserSession: (browserSession: boolean) => void;
  setLangGraph: (langGraph: boolean) => void;
  setSessionTime: (time?: number) => void;
  setTab: (tab: TraceViewStoreState["tab"]) => void;
  setTreeWidth: (width: number) => void;
  setHasBrowserSession: (hasBrowserSession: boolean) => void;
  toggleCollapse: (spanId: string) => void;
  updateTraceVisibility: (visibility: "private" | "public") => void;
  saveSpanTemplate: (spanPathKey: string, template: string) => void;
  deleteSpanTemplate: (spanPathKey: string) => void;
  setShowTreeContent: (show: boolean) => void;

  // Condensed timeline actions
  setCondensedTimelineEnabled: (enabled: boolean) => void;
  setCondensedTimelineVisibleSpanIds: (ids: Set<string>) => void;
  clearCondensedTimelineSelection: () => void;
  setCondensedTimelineZoom: (zoom: number) => void;

  incrementSessionTime: (increment: number, maxTime: number) => boolean;
  // Selectors
  getTreeSpans: () => TreeSpan[];
  getTimelineData: () => TimelineData;
  getCondensedTimelineData: () => CondensedTimelineData;
  getMinimapSpans: () => MinimapSpan[];
  getListMinimapSpans: () => MinimapSpan[];
  getListData: () => TraceViewListSpan[];
  getSpanNameInfo: (spanId: string) => { name: string; count?: number } | undefined;
  getHasLangGraph: () => boolean;
  getSpanBranch: <T extends { spanId: string; parentSpanId?: string }>(span: T) => T[];
  getSpanTemplate: (spanPathKey: string) => string | undefined;
  getSpanAttribute: (spanId: string, attributeKey: string) => any | undefined;
  rebuildSpanPathCounts: () => void;
  addSpanIfNew: (span: TraceViewSpan) => boolean;
}

type TraceViewStore = TraceViewStoreState & TraceViewStoreActions;

const createTraceViewStore = (initialTrace?: TraceViewTrace, storeKey?: string) =>
  createStore<TraceViewStore>()(
    persist(
      (set, get) => ({
        trace: initialTrace,
        isTraceLoading: false,
        traceError: undefined,
        spans: [],
        isSpansLoading: false,
        spansError: undefined,
        selectedSpan: undefined,
        browserSession: initialTrace?.hasBrowserSession || false,
        sessionTime: undefined,
        tab: "tree",
        treeWidth: MIN_TREE_VIEW_WIDTH,
        langGraph: false,
        spanPath: null,
        hasBrowserSession: initialTrace?.hasBrowserSession || false,
        spanTemplates: {},
        spanPathCounts: new Map(),
        showTreeContent: true,
        condensedTimelineEnabled: true,
        condensedTimelineVisibleSpanIds: new Set(),
        condensedTimelineZoom: 1,

        setHasBrowserSession: (hasBrowserSession: boolean) => set({ hasBrowserSession }),
        setTrace: (trace) => {
          if (typeof trace === "function") {
            const prevTrace = get().trace;
            const newTrace = trace(prevTrace);
            set({ trace: newTrace });
          } else {
            set({ trace });
          }
        },
        setTraceError: (traceError) => set({ traceError }),
        setSpansError: (spansError) => set({ spansError }),
        updateTraceVisibility: (visibility) => {
          get().setTrace((trace) => {
            if (trace) {
              return { ...trace, visibility };
            }
            return trace;
          });
        },
        setSpans: (spans) => {
          if (typeof spans === "function") {
            const prevSpans = get().spans;
            const newSpans = spans(prevSpans);
            set({ spans: newSpans });
          } else {
            set({ spans: spans.map((s) => ({ ...s, collapsed: false })) });
          }
        },
        getTreeSpans: () => {
          const { spans, condensedTimelineVisibleSpanIds } = get();

          // If no selection, show all spans
          const filteredSpans =
            condensedTimelineVisibleSpanIds.size === 0
              ? spans
              : spans.filter((s) => condensedTimelineVisibleSpanIds.has(s.spanId));

          const pathInfoMap = computePathInfoMap(filteredSpans);
          return transformSpansToTree(filteredSpans, pathInfoMap);
        },
        getMinimapSpans: () => {
          const { trace, spans, condensedTimelineVisibleSpanIds } = get();
          if (trace) {
            const startTime = new Date(trace.startTime).getTime();
            const endTime = new Date(trace.endTime).getTime();

            const filteredSpans =
              condensedTimelineVisibleSpanIds.size === 0
                ? spans
                : spans.filter((s) => condensedTimelineVisibleSpanIds.has(s.spanId));

            return transformSpansToMinimap(filteredSpans, endTime - startTime);
          }
          return [];
        },
        getListMinimapSpans: () => {
          const { trace, spans, condensedTimelineVisibleSpanIds } = get();
          if (trace) {
            const startTime = new Date(trace.startTime).getTime();
            const endTime = new Date(trace.endTime).getTime();

            // First filter by condensed timeline selection
            const selectionFilteredSpans =
              condensedTimelineVisibleSpanIds.size === 0
                ? spans
                : spans.filter((s) => condensedTimelineVisibleSpanIds.has(s.spanId));

            // Then apply DEFAULT filter for list view
            const listSpans = selectionFilteredSpans.filter((span) => span.spanType !== "DEFAULT");
            return transformSpansToFlatMinimap(listSpans, endTime - startTime);
          }
          return [];
        },
        getTimelineData: () => {
          const { spans, condensedTimelineVisibleSpanIds } = get();

          const filteredSpans =
            condensedTimelineVisibleSpanIds.size === 0
              ? spans
              : spans.filter((s) => condensedTimelineVisibleSpanIds.has(s.spanId));

          return transformSpansToTimeline(filteredSpans);
        },
        getListData: () => {
          const { spans, condensedTimelineVisibleSpanIds } = get();

          // First filter by condensed timeline selection if active
          const selectionFilteredSpans =
            condensedTimelineVisibleSpanIds.size === 0
              ? spans
              : spans.filter((s) => condensedTimelineVisibleSpanIds.has(s.spanId));

          // Then apply existing DEFAULT filter (removes ancestor clutter)
          const listSpans = selectionFilteredSpans.filter((span) => span.spanType !== "DEFAULT");
          const pathInfoMap = computePathInfoMap(spans);

          const lightweightListSpans: TraceViewListSpan[] = listSpans.map((span) => ({
            spanId: span.spanId,
            parentSpanId: span.parentSpanId,
            spanType: span.spanType,
            name: span.name,
            model: span.model,
            startTime: span.startTime,
            endTime: span.endTime,
            totalTokens: span.totalTokens,
            cacheReadInputTokens: span.cacheReadInputTokens,
            totalCost: span.totalCost,
            pending: span.pending,
            pathInfo: pathInfoMap.get(span.spanId) ?? null,
          }));

          return lightweightListSpans;
        },

        setSelectedSpan: (span) => set({ selectedSpan: span }),
        selectSpanById: (spanId: string) => {
          const span = get().spans.find((s) => s.spanId === spanId);
          if (span && !span.pending) {
            // Expand collapsed ancestors first
            const spanMap = new Map(get().spans.map((s) => [s.spanId, s]));
            const ancestorIds = new Set<string>();
            let currentId = span.parentSpanId;
            while (currentId) {
              ancestorIds.add(currentId);
              const parent = spanMap.get(currentId);
              currentId = parent?.parentSpanId;
            }

            // Expand any collapsed ancestors
            if (ancestorIds.size > 0) {
              get().setSpans((prevSpans) =>
                prevSpans.map((s) => (ancestorIds.has(s.spanId) && s.collapsed ? { ...s, collapsed: false } : s))
              );
            }

            set({ selectedSpan: span });
            const spanPath = span.attributes?.["lmnr.span.path"];
            if (spanPath && Array.isArray(spanPath)) {
              set({ spanPath });
            }
          }
        },
        setSessionTime: (sessionTime) => set({ sessionTime }),
        setIsTraceLoading: (isTraceLoading) => set({ isTraceLoading }),
        setIsSpansLoading: (isSpansLoading) => set({ isSpansLoading }),
        setLangGraph: (langGraph: boolean) => set({ langGraph }),
        setTab: (tab) => set({ tab }),
        incrementSessionTime: (increment: number, maxTime: number) => {
          const currentTime = get().sessionTime || 0;
          const newTime = Math.min(currentTime + increment, maxTime);
          set({ sessionTime: newTime });
          return newTime >= maxTime;
        },
        setTreeWidth: (treeWidth) => set({ treeWidth }),
        saveSpanTemplate: (spanPathKey: string, template: string) => {
          set((state) => ({
            spanTemplates: { ...state.spanTemplates, [spanPathKey]: template },
          }));
        },
        deleteSpanTemplate: (spanPathKey: string) => {
          set((state) => {
            const newTemplates = { ...state.spanTemplates };
            delete newTemplates[spanPathKey];
            return { spanTemplates: newTemplates };
          });
        },
        setShowTreeContent: (showTreeContent: boolean) => set({ showTreeContent }),
        setCondensedTimelineEnabled: (enabled: boolean) => set({ condensedTimelineEnabled: enabled }),
        setCondensedTimelineVisibleSpanIds: (ids: Set<string>) => set({ condensedTimelineVisibleSpanIds: ids }),
        clearCondensedTimelineSelection: () => set({ condensedTimelineVisibleSpanIds: new Set() }),
        setCondensedTimelineZoom: (zoom) => {
          set({ condensedTimelineZoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) });
        },
        getCondensedTimelineData: () => transformSpansToCondensedTimeline(get().spans),
        setBrowserSession: (browserSession: boolean) => set({ browserSession }),
        toggleCollapse: (spanId: string) => {
          get().setSpans((spans) =>
            spans.map((span) => (span.spanId === spanId ? { ...span, collapsed: !span.collapsed } : span))
          );
        },
        setSpanPath: (spanPath) => set({ spanPath }),
        getHasLangGraph: () =>
          !!get().spans.find(
            (s) => s.attributes && has(s.attributes, SPAN_KEYS.NODES) && has(s.attributes, SPAN_KEYS.EDGES)
          ),
        getSpanBranch: <T extends { spanId: string; parentSpanId?: string }>(span: T): T[] => {
          const spans = get().spans as unknown as T[];
          const spanMap = new Map(spans.map((s) => [s.spanId, s]));

          const parentChain: T[] = [];
          let currentSpanId: string | undefined = span.parentSpanId;

          while (currentSpanId) {
            const parentSpan = spanMap.get(currentSpanId);
            if (!parentSpan) break;
            parentChain.unshift(parentSpan);
            currentSpanId = parentSpan.parentSpanId;
          }

          const descendantPath: T[] = [span];
          let currentId = span.spanId;

          while (true) {
            const children = spans.filter((s) => s.parentSpanId === currentId);
            if (children.length === 0) break;

            const firstChild = children[0];
            descendantPath.push(firstChild);
            currentId = firstChild.spanId;
          }

          return [...parentChain, ...descendantPath];
        },
        getSpanNameInfo: (spanId: string) => {
          const spans = get().spans;
          const listSpans = spans.filter((span) => span.spanType !== "DEFAULT");
          const spanMap = new Map(
            spans.map((span) => [
              span.spanId,
              {
                spanId: span.spanId,
                name: span.name,
                parentSpanId: span.parentSpanId,
              },
            ])
          );
          const sections = groupIntoSections(listSpans);
          const spanNameMap = buildSpanNameMap(sections, spanMap);
          return spanNameMap.get(spanId);
        },
        getSpanTemplate: (spanPathKey: string) => get().spanTemplates[spanPathKey],
        getSpanAttribute: (spanId: string, attributeKey: string) => {
          const span = get().spans.find((s) => s.spanId === spanId);
          return span?.attributes?.[attributeKey];
        },
        rebuildSpanPathCounts: () => {
          const spans = get().spans;
          const pathCounts = new Map<string, number>();

          spans.forEach((span) => {
            const spanPath = span.attributes?.["lmnr.span.path"];
            if (spanPath && Array.isArray(spanPath)) {
              const pathKey = spanPath.join("/");
              pathCounts.set(pathKey, (pathCounts.get(pathKey) ?? 0) + 1);
            }
          });

          set({ spanPathCounts: pathCounts });
        },
        addSpanIfNew: (incomingSpan: TraceViewSpan): boolean => {
          const spanPath = incomingSpan.attributes?.["lmnr.span.path"];
          if (!spanPath || !Array.isArray(spanPath)) {
            // No span path, check by spanId
            const exists = get().spans.some((s) => s.spanId === incomingSpan.spanId);
            if (!exists) {
              get().setSpans((prevSpans) => [...prevSpans, incomingSpan]);
              return true;
            }
            return false;
          }

          const pathKey = spanPath.join("/");
          const currentCount = get().spanPathCounts.get(pathKey) ?? 0;

          // This is a new occurrence of this path
          get().spanPathCounts.set(pathKey, currentCount + 1);
          get().setSpans((prevSpans) => [...prevSpans, incomingSpan]);
          return true;
        },
      }),
      {
        name: storeKey ?? "trace-view-state",
        partialize: (state) => {
          const persistentTabs = ["tree", "reader"] as const;
          const tabToPersist = persistentTabs.includes(state.tab as any) ? state.tab : undefined;

          return {
            treeWidth: state.treeWidth,
            spanPath: state.spanPath,
            spanTemplates: state.spanTemplates,
            ...(tabToPersist && { tab: tabToPersist }),
            showTreeContent: state.showTreeContent,
            condensedTimelineEnabled: state.condensedTimelineEnabled,
          };
        },
      }
    )
  );

const TraceViewStoreContext = createContext<StoreApi<TraceViewStore> | undefined>(undefined);

const TraceViewStoreProvider = ({
  children,
  initialTrace,
  storeKey,
}: PropsWithChildren<{ initialTrace?: TraceViewTrace; storeKey?: string }>) => {
  const storeRef = useRef<StoreApi<TraceViewStore>>(undefined);

  if (!storeRef.current) {
    storeRef.current = createTraceViewStore(initialTrace, storeKey);
  }

  return <TraceViewStoreContext.Provider value={storeRef.current}>{children}</TraceViewStoreContext.Provider>;
};

export const useTraceViewStoreContext = <T,>(selector: (store: TraceViewStore) => T): T => {
  const store = useContext(TraceViewStoreContext);
  if (!store) {
    throw new Error("useTraceViewStoreContext must be used within a TraceViewStoreContext");
  }

  return useStore(store, selector);
};

export const useTraceViewStore = () => {
  const store = useContext(TraceViewStoreContext);
  if (!store) {
    throw new Error("useTraceViewStore must be used within a TraceViewStoreContext");
  }
  return store;
};

export default TraceViewStoreProvider;
