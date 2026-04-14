import { clamp, has } from "lodash";
import { createContext, useContext } from "react";
import { type StoreApi, useStore } from "zustand";

import { type SnippetInfo } from "@/lib/actions/traces/search";
import { type SpanEvent } from "@/lib/events/types";
import { SPAN_KEYS } from "@/lib/lang-graph/types";
import { type SpanType } from "@/lib/traces/types";

import {
  computePathInfoMap,
  type CondensedTimelineData,
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
  reasoningTokens?: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  aggregatedMetrics?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
    cacheReadInputTokens?: number;
    reasoningTokens?: number;
    hasLLMDescendants: boolean;
  };
  isSubagent?: boolean;
  inputSnippet?: SnippetInfo;
  outputSnippet?: SnippetInfo;
  attributesSnippet?: SnippetInfo;
};

export type TraceViewListSpan = {
  spanId: string;
  parentSpanId?: string;
  spanType: SpanType;
  name: string;
  model?: string;
  path: string;
  startTime: string;
  endTime: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  totalCost: number;
  pending?: boolean;
  pathInfo: {
    display: Array<{ spanId: string; name: string; count?: number }>;
    full: Array<{ spanId: string; name: string }>;
  } | null;
  inputSnippet?: SnippetInfo;
  outputSnippet?: SnippetInfo;
  attributesSnippet?: SnippetInfo;
};

export type TranscriptListGroup = {
  type: "group";
  groupId: string;
  name: string;
  path: string;
  spans: TraceViewListSpan[];
  firstLlmSpanId: string | null;
  startTime: string;
  endTime: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  totalCost: number;
  isSubagent: boolean;
};

export type TranscriptListEntry = { type: "span"; span: TraceViewListSpan } | TranscriptListGroup;

export type TraceViewTrace = {
  id: string;
  startTime: string;
  endTime: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadInputTokens?: number;
  reasoningTokens?: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  metadata: string;
  status: string;
  traceType: string;
  visibility: "public" | "private";
  hasBrowserSession: boolean;
  sessionId?: string;
};

export type TraceSignal = {
  signalId: string;
  signalName: string;
  prompt: string;
  schemaFields: Array<{ name: string; type: string; description?: string }>;
  events: Array<Record<string, any>>;
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
  tab: "tree" | "transcript";
  hasBrowserSession: boolean;
  showTreeContent: boolean;
  condensedTimelineEnabled: boolean;
  condensedTimelineVisibleSpanIds: Set<string>;
  condensedTimelineZoom: number;
  isCostHeatmapVisible: boolean;

  // Panel visibility
  spanPanelOpen: boolean;
  tracesAgentOpen: boolean;
  signalsPanelOpen: boolean;

  // Signal data for the signal events panel
  traceSignals: TraceSignal[];
  isTraceSignalsLoading: boolean;
  activeSignalTabId: string | null;

  // Set once at store creation. When signals are fetched (by either Header or
  // SignalEventsPanel — whichever wins the race), the fetch callback checks this
  // value to pick the correct default tab instead of blindly selecting the first
  // signal. This avoids brittle useEffect chains that try to fix the tab after
  // the fact.
  initialSignalId?: string;

  // Pending signal→chat injection. Written by openSignalInChat, consumed
  // once by the Chat component's effect, then nulled.
  pendingChatInjection: {
    signalDefinition: string;
    eventPayload: string;
  } | null;

  // Layout options
  isAlwaysSelectSpan: boolean;

  // Transcript mode group collapse state
  transcriptCollapsedGroups: Set<string>;
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
  setShowTreeContent: (show: boolean) => void;
  incrementSessionTime: (increment: number, maxTime: number) => boolean;

  setCondensedTimelineEnabled: (enabled: boolean) => void;
  setCondensedTimelineVisibleSpanIds: (ids: Set<string>) => void;
  clearCondensedTimelineSelection: () => void;
  setCondensedTimelineZoom: (zoom: number) => void;
  setIsCostHeatmapVisible: (visible: boolean) => void;
  selectMaxSpanCost: () => number;

  // Panel visibility actions
  setSpanPanelOpen: (open: boolean) => void;
  setTracesAgentOpen: (open: boolean) => void;
  setSignalsPanelOpen: (open: boolean) => void;

  // Signal data actions
  setTraceSignals: (signals: TraceSignal[]) => void;
  setIsTraceSignalsLoading: (loading: boolean) => void;
  setActiveSignalTabId: (id: string | null) => void;

  // Traces Agent injection actions
  openSignalInChat: (signalDefinition: string, eventPayload: string) => void;
  consumePendingChatInjection: () => { signalDefinition: string; eventPayload: string } | null;

  toggleTranscriptGroup: (groupId: string) => void;

  getTreeSpans: () => TreeSpan[];
  getCondensedTimelineData: () => CondensedTimelineData;
  getListData: () => TraceViewListSpan[];
  getTranscriptListData: () => TranscriptListEntry[];
  getHasLangGraph: () => boolean;
  getSpanAttribute: (spanId: string, attributeKey: string) => any | undefined;
}

export type BaseTraceViewStore = BaseTraceViewState & BaseTraceViewActions;

export function createBaseTraceViewSlice<T extends BaseTraceViewStore>(
  set: (partial: T | Partial<T> | ((state: T) => T | Partial<T>)) => void,
  get: () => T,
  options?: {
    initialTrace?: TraceViewTrace;
    isAlwaysSelectSpan?: boolean;
    initialSignalId?: string;
    initialChatOpen?: boolean;
  }
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
    showTreeContent: true,
    condensedTimelineEnabled: true,
    condensedTimelineVisibleSpanIds: new Set(),
    condensedTimelineZoom: 1,
    isCostHeatmapVisible: false,

    // Panel visibility defaults
    spanPanelOpen: true,
    tracesAgentOpen: options?.initialChatOpen ?? false,
    signalsPanelOpen: false,

    // Signal data defaults
    traceSignals: [],
    isTraceSignalsLoading: false,
    activeSignalTabId: null,
    initialSignalId: options?.initialSignalId,

    // Traces Agent injection defaults
    pendingChatInjection: null,

    // Layout options
    isAlwaysSelectSpan: options?.isAlwaysSelectSpan ?? false,

    // Transcript mode group collapse state (all collapsed by default)
    transcriptCollapsedGroups: new Set<string>(),

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
        path: span.path,
        startTime: span.startTime,
        endTime: span.endTime,
        inputTokens: span.inputTokens,
        outputTokens: span.outputTokens,
        cacheReadInputTokens: span.cacheReadInputTokens,
        totalCost: span.totalCost,
        pending: span.pending,
        pathInfo: pathInfoMap.get(span.spanId) ?? null,
        inputSnippet: span.inputSnippet,
        outputSnippet: span.outputSnippet,
        attributesSnippet: span.attributesSnippet,
      }));

      return lightweightListSpans;
    },

    getTranscriptListData: () => {
      const { spans, condensedTimelineVisibleSpanIds } = get();

      const selectionFilteredSpans =
        condensedTimelineVisibleSpanIds.size === 0
          ? spans
          : spans.filter((s) => condensedTimelineVisibleSpanIds.has(s.spanId));

      const listSpans = selectionFilteredSpans.filter((span) => span.spanType !== "DEFAULT");
      const pathInfoMap = computePathInfoMap(spans);

      const toLightweight = (span: TraceViewSpan): TraceViewListSpan => ({
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        spanType: span.spanType,
        name: span.name,
        model: span.model,
        path: span.path,
        startTime: span.startTime,
        endTime: span.endTime,
        inputTokens: span.inputTokens,
        outputTokens: span.outputTokens,
        cacheReadInputTokens: span.cacheReadInputTokens,
        totalCost: span.totalCost,
        pending: span.pending,
        pathInfo: pathInfoMap.get(span.spanId) ?? null,
        inputSnippet: span.inputSnippet,
        outputSnippet: span.outputSnippet,
        attributesSnippet: span.attributesSnippet,
      });

      const groupBoundarySet = new Set(spans.filter((s) => s.isSubagent).map((s) => s.spanId));
      if (groupBoundarySet.size === 0) {
        return listSpans.map((span): TranscriptListEntry => ({ type: "span", span: toLightweight(span) }));
      }

      const parentMap = new Map<string, string | undefined>();
      const spanMap = new Map<string, TraceViewSpan>();
      for (const s of spans) {
        parentMap.set(s.spanId, s.parentSpanId);
        spanMap.set(s.spanId, s);
      }

      // Walk up ancestors to find which boundary (if any) a span belongs to
      const spanGroupCache = new Map<string, string | null>();
      const findGroupBoundary = (spanId: string): string | null => {
        if (spanGroupCache.has(spanId)) return spanGroupCache.get(spanId)!;

        const visited: string[] = [spanId];
        let current = spanId;
        let result: string | null = null;

        while (current) {
          if (groupBoundarySet.has(current)) {
            result = current;
            break;
          }
          const parent = parentMap.get(current);
          if (!parent) break;
          if (spanGroupCache.has(parent)) {
            result = spanGroupCache.get(parent)!;
            break;
          }
          visited.push(parent);
          current = parent;
        }

        for (const id of visited) {
          spanGroupCache.set(id, result);
        }
        return result;
      };

      // Pass 1: collect all spans per boundary, preserving time order
      const groupSpansMap = new Map<string, TraceViewSpan[]>();

      for (const span of listSpans) {
        const boundary = findGroupBoundary(span.spanId);
        if (!boundary) continue;

        if (!groupSpansMap.has(boundary)) {
          groupSpansMap.set(boundary, []);
        }
        groupSpansMap.get(boundary)!.push(span);
      }

      // Pass 2: emit entries — standalone spans in order, groups at first occurrence
      const emittedGroups = new Set<string>();
      const entries: TranscriptListEntry[] = [];

      for (const span of listSpans) {
        const boundary = findGroupBoundary(span.spanId);

        if (!boundary) {
          entries.push({ type: "span", span: toLightweight(span) });
          continue;
        }

        if (emittedGroups.has(boundary)) continue;
        emittedGroups.add(boundary);

        const groupSpans = groupSpansMap.get(boundary)!;
        const firstLlm = groupSpans.find((s) => s.spanType === "LLM" || s.spanType === "CACHED");

        if (!firstLlm) {
          for (const s of groupSpans) {
            entries.push({ type: "span", span: toLightweight(s) });
          }
          continue;
        }

        const boundarySpan = spanMap.get(boundary);

        let inputTokens = 0;
        let outputTokens = 0;
        let cacheReadInputTokens = 0;
        let totalCost = 0;
        for (const s of groupSpans) {
          inputTokens += s.inputTokens;
          outputTokens += s.outputTokens;
          cacheReadInputTokens += s.cacheReadInputTokens ?? 0;
          totalCost += s.totalCost;
        }

        entries.push({
          type: "group",
          groupId: `group-${boundary}`,
          name: boundarySpan?.name ?? groupSpans[0].name,
          path: boundarySpan?.path ?? "",
          spans: groupSpans.map(toLightweight),
          firstLlmSpanId: firstLlm.spanId,
          startTime: groupSpans[0].startTime,
          endTime: groupSpans[groupSpans.length - 1].endTime,
          inputTokens,
          outputTokens,
          cacheReadInputTokens,
          totalCost,
          isSubagent: true,
        });
      }

      return entries;
    },

    toggleTranscriptGroup: (groupId: string) => {
      const prev = get().transcriptCollapsedGroups;
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      set({ transcriptCollapsedGroups: next } as Partial<T>);
    },

    setSelectedSpan: (span) => set({ selectedSpan: span, spanPanelOpen: !!span } as Partial<T>),
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

        get().setSelectedSpan(span);
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
    setShowTreeContent: (showTreeContent: boolean) => set({ showTreeContent } as Partial<T>),
    setCondensedTimelineEnabled: (enabled: boolean) => set({ condensedTimelineEnabled: enabled } as Partial<T>),
    setCondensedTimelineVisibleSpanIds: (ids: Set<string>) =>
      set({ condensedTimelineVisibleSpanIds: ids } as Partial<T>),
    clearCondensedTimelineSelection: () => set({ condensedTimelineVisibleSpanIds: new Set() } as Partial<T>),
    setCondensedTimelineZoom: (zoom) => {
      set({ condensedTimelineZoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) } as Partial<T>);
    },
    setIsCostHeatmapVisible: (visible: boolean) => set({ isCostHeatmapVisible: visible } as Partial<T>),
    selectMaxSpanCost: () => {
      const spans = get().spans;
      let max = 0;
      for (const span of spans) {
        if (span.totalCost > max) {
          max = span.totalCost;
        }
      }
      return max;
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
    getSpanAttribute: (spanId: string, attributeKey: string) => {
      const span = get().spans.find((s) => s.spanId === spanId);
      return span?.attributes?.[attributeKey];
    },

    // Panel visibility actions
    setSpanPanelOpen: (open: boolean) => set({ spanPanelOpen: open } as Partial<T>),
    setTracesAgentOpen: (open: boolean) => set({ tracesAgentOpen: open } as Partial<T>),
    setSignalsPanelOpen: (open: boolean) => set({ signalsPanelOpen: open } as Partial<T>),

    // Signal data actions
    setTraceSignals: (signals: TraceSignal[]) => set({ traceSignals: signals } as Partial<T>),
    setIsTraceSignalsLoading: (loading: boolean) => set({ isTraceSignalsLoading: loading } as Partial<T>),
    setActiveSignalTabId: (id: string | null) => set({ activeSignalTabId: id } as Partial<T>),

    // Traces Agent injection actions
    openSignalInChat: (signalDefinition: string, eventPayload: string) => {
      get().setTracesAgentOpen(true);
      set({ pendingChatInjection: { signalDefinition, eventPayload } } as Partial<T>);
    },
    consumePendingChatInjection: () => {
      const pending = get().pendingChatInjection;
      if (pending) {
        set({ pendingChatInjection: null } as Partial<T>);
      }
      return pending;
    },
  };
}

export const TraceViewContext = createContext<StoreApi<BaseTraceViewStore> | undefined>(undefined);

export const useTraceViewBaseStore = <T>(
  selector: (store: BaseTraceViewStore) => T,
  equalityFn?: (a: T, b: T) => boolean
): T => {
  const store = useContext(TraceViewContext);
  if (!store) {
    throw new Error("useTraceViewContext must be used within a TraceViewContext provider");
  }
  return useStore(store, selector, equalityFn);
};

export const useTraceViewBaseStoreRaw = () => {
  const store = useContext(TraceViewContext);
  if (!store) {
    throw new Error("useTraceViewBaseStore must be used within a TraceViewContext provider");
  }
  return store;
};
