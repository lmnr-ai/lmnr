import { clamp, has } from "lodash";
import { createContext, useContext } from "react";
import { type StoreApi, useStore } from "zustand";

import { type SpanEvent } from "@/lib/events/types";
import { SPAN_KEYS } from "@/lib/lang-graph/types";
import { type SpanType } from "@/lib/traces/types";

import {
  buildSpanNameMap,
  computePathInfoMap,
  type CondensedTimelineData,
  groupIntoSections,
  transformSpansToCondensedTimeline,
  transformSpansToTree,
  type TreeSpan,
} from "./utils";

export const MAX_ZOOM = 18;
export const MIN_ZOOM = 1;
export const ZOOM_INCREMENT = 0.5;

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
  events: SpanEvent[];
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

export interface BaseTraceViewState {
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
  sessionStartTime?: number;
  tab: "tree" | "reader";
  hasBrowserSession: boolean;
  spanTemplates: Record<string, string>;
  spanPathCounts: Map<string, number>;
  showTreeContent: boolean;
  condensedTimelineEnabled: boolean;
  condensedTimelineVisibleSpanIds: Set<string>;
  condensedTimelineZoom: number;
  cachingEnabled: boolean;
}

export interface BaseTraceViewActions {
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
  setSessionStartTime: (time?: number) => void;
  setTab: (tab: BaseTraceViewState["tab"]) => void;
  setHasBrowserSession: (hasBrowserSession: boolean) => void;
  toggleCollapse: (spanId: string) => void;
  updateTraceVisibility: (visibility: "private" | "public") => void;
  saveSpanTemplate: (spanPathKey: string, template: string) => void;
  deleteSpanTemplate: (spanPathKey: string) => void;
  setShowTreeContent: (show: boolean) => void;
  incrementSessionTime: (increment: number, maxTime: number) => boolean;

  setCondensedTimelineEnabled: (enabled: boolean) => void;
  setCondensedTimelineVisibleSpanIds: (ids: Set<string>) => void;
  clearCondensedTimelineSelection: () => void;
  setCondensedTimelineZoom: (zoom: number) => void;

  getTreeSpans: () => TreeSpan[];
  getCondensedTimelineData: () => CondensedTimelineData;
  getListData: () => TraceViewListSpan[];
  getSpanNameInfo: (spanId: string) => { name: string; count?: number } | undefined;
  getHasLangGraph: () => boolean;
  getSpanBranch: <T extends { spanId: string; parentSpanId?: string }>(span: T) => T[];
  getSpanTemplate: (spanPathKey: string) => string | undefined;
  getSpanAttribute: (spanId: string, attributeKey: string) => any | undefined;
  rebuildSpanPathCounts: () => void;
  isSpanCached: (span: TraceViewSpan) => boolean;
  cacheToSpan: (span: TraceViewSpan) => void;
  uncacheFromSpan: (span: TraceViewSpan) => void;
}

export type BaseTraceViewStore = BaseTraceViewState & BaseTraceViewActions;

export function createBaseTraceViewSlice<T extends BaseTraceViewStore>(
  set: (partial: T | Partial<T> | ((state: T) => T | Partial<T>)) => void,
  get: () => T,
  options?: { initialTrace?: TraceViewTrace }
): BaseTraceViewStore {
  return {
    trace: options?.initialTrace,
    isTraceLoading: false,
    traceError: undefined,
    spans: [],
    isSpansLoading: false,
    spansError: undefined,
    selectedSpan: undefined,
    browserSession: options?.initialTrace?.hasBrowserSession || false,
    sessionTime: undefined,
    sessionStartTime: undefined,
    tab: "tree",
    langGraph: false,
    spanPath: null,
    hasBrowserSession: options?.initialTrace?.hasBrowserSession || false,
    spanTemplates: {},
    spanPathCounts: new Map(),
    showTreeContent: true,
    condensedTimelineEnabled: true,
    condensedTimelineVisibleSpanIds: new Set(),
    condensedTimelineZoom: 1,
    cachingEnabled: false,

    setHasBrowserSession: (hasBrowserSession: boolean) => set({ hasBrowserSession } as Partial<T>),
    setTrace: (trace) => {
      if (typeof trace === "function") {
        const prevTrace = get().trace;
        const newTrace = trace(prevTrace);
        set({ trace: newTrace } as Partial<T>);
      } else {
        set({ trace } as Partial<T>);
      }
    },
    setTraceError: (traceError) => set({ traceError } as Partial<T>),
    setSpansError: (spansError) => set({ spansError } as Partial<T>),
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
        set({ spans: newSpans } as Partial<T>);
      } else {
        set({ spans: spans.map((s) => ({ ...s, collapsed: false })) } as Partial<T>);
      }
    },
    getTreeSpans: () => {
      const { spans, condensedTimelineVisibleSpanIds } = get();

      const filteredSpans =
        condensedTimelineVisibleSpanIds.size === 0
          ? spans
          : spans.filter((s) => condensedTimelineVisibleSpanIds.has(s.spanId));

      const pathInfoMap = computePathInfoMap(filteredSpans);
      return transformSpansToTree(filteredSpans, pathInfoMap);
    },
    getListData: () => {
      const { spans, condensedTimelineVisibleSpanIds } = get();

      const selectionFilteredSpans =
        condensedTimelineVisibleSpanIds.size === 0
          ? spans
          : spans.filter((s) => condensedTimelineVisibleSpanIds.has(s.spanId));

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

    setSelectedSpan: (span) => set({ selectedSpan: span } as Partial<T>),
    selectSpanById: (spanId: string) => {
      const span = get().spans.find((s) => s.spanId === spanId);
      if (span && !span.pending) {
        const spanMap = new Map(get().spans.map((s) => [s.spanId, s]));
        const ancestorIds = new Set<string>();
        let currentId = span.parentSpanId;
        while (currentId) {
          ancestorIds.add(currentId);
          const parent = spanMap.get(currentId);
          currentId = parent?.parentSpanId;
        }

        if (ancestorIds.size > 0) {
          get().setSpans((prevSpans) =>
            prevSpans.map((s) => (ancestorIds.has(s.spanId) && s.collapsed ? { ...s, collapsed: false } : s))
          );
        }

        set({ selectedSpan: span } as Partial<T>);
        const spanPath = span.attributes?.["lmnr.span.path"];
        if (spanPath && Array.isArray(spanPath)) {
          set({ spanPath } as Partial<T>);
        }
      }
    },
    setSessionTime: (sessionTime) => set({ sessionTime } as Partial<T>),
    setSessionStartTime: (sessionStartTime) => set({ sessionStartTime } as Partial<T>),
    setIsTraceLoading: (isTraceLoading) => set({ isTraceLoading } as Partial<T>),
    setIsSpansLoading: (isSpansLoading) => set({ isSpansLoading } as Partial<T>),
    setLangGraph: (langGraph: boolean) => set({ langGraph } as Partial<T>),
    setTab: (tab) => set({ tab } as Partial<T>),
    incrementSessionTime: (increment: number, maxTime: number) => {
      const currentTime = get().sessionTime || 0;
      const newTime = Math.min(currentTime + increment, maxTime);
      set({ sessionTime: newTime } as Partial<T>);
      return newTime >= maxTime;
    },
    saveSpanTemplate: (spanPathKey: string, template: string) => {
      set(
        (state) =>
          ({
            spanTemplates: { ...state.spanTemplates, [spanPathKey]: template },
          }) as Partial<T>
      );
    },
    deleteSpanTemplate: (spanPathKey: string) => {
      set((state) => {
        const newTemplates = { ...state.spanTemplates };
        delete newTemplates[spanPathKey];
        return { spanTemplates: newTemplates } as Partial<T>;
      });
    },
    setShowTreeContent: (showTreeContent: boolean) => set({ showTreeContent } as Partial<T>),
    setCondensedTimelineEnabled: (enabled: boolean) => set({ condensedTimelineEnabled: enabled } as Partial<T>),
    setCondensedTimelineVisibleSpanIds: (ids: Set<string>) =>
      set({ condensedTimelineVisibleSpanIds: ids } as Partial<T>),
    clearCondensedTimelineSelection: () => set({ condensedTimelineVisibleSpanIds: new Set() } as Partial<T>),
    setCondensedTimelineZoom: (zoom) => {
      set({ condensedTimelineZoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) } as Partial<T>);
    },
    getCondensedTimelineData: () => transformSpansToCondensedTimeline(get().spans),
    setBrowserSession: (browserSession: boolean) => set({ browserSession } as Partial<T>),
    toggleCollapse: (spanId: string) => {
      get().setSpans((spans) =>
        spans.map((span) => (span.spanId === spanId ? { ...span, collapsed: !span.collapsed } : span))
      );
    },
    setSpanPath: (spanPath) => set({ spanPath } as Partial<T>),
    getHasLangGraph: () =>
      !!get().spans.find(
        (s) => s.attributes && has(s.attributes, SPAN_KEYS.NODES) && has(s.attributes, SPAN_KEYS.EDGES)
      ),
    getSpanBranch: <U extends { spanId: string; parentSpanId?: string }>(span: U): U[] => {
      const spans = get().spans as unknown as U[];
      const spanMap = new Map(spans.map((s) => [s.spanId, s]));

      const parentChain: U[] = [];
      let currentSpanId: string | undefined = span.parentSpanId;

      while (currentSpanId) {
        const parentSpan = spanMap.get(currentSpanId);
        if (!parentSpan) break;
        parentChain.unshift(parentSpan);
        currentSpanId = parentSpan.parentSpanId;
      }

      const descendantPath: U[] = [span];
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

      set({ spanPathCounts: pathCounts } as Partial<T>);
    },

    isSpanCached: () => false,
    cacheToSpan: () => {},
    uncacheFromSpan: () => {},
  };
}

export const TraceViewContext = createContext<StoreApi<BaseTraceViewStore> | undefined>(undefined);

export const useTraceViewContext = <T>(selector: (store: BaseTraceViewStore) => T): T => {
  const store = useContext(TraceViewContext);
  if (!store) {
    throw new Error("useTraceViewContext must be used within a TraceViewContext provider");
  }
  return useStore(store, selector);
};
