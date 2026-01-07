import { has } from "lodash";
import { createContext, PropsWithChildren, useContext, useRef } from "react";
import { createStore, StoreApi, useStore } from "zustand";
import { persist } from "zustand/middleware";

import {
  buildParentChain,
  buildPathInfo,
  buildSpanNameMap,
  groupIntoSections,
  MinimapSpan,
  TimelineData,
  transformSpansToFlatMinimap,
  transformSpansToMinimap,
  transformSpansToTimeline,
  transformSpansToTree,
  TreeSpan,
} from "@/components/traces/trace-view/trace-view-store-utils.ts";
import { RolloutSessionStatus } from "@/lib/actions/rollout-sessions";
import { Event } from "@/lib/events/types";
import { SPAN_KEYS } from "@/lib/lang-graph/types";
import { SpanType } from "@/lib/traces/types";

import { SystemMessage } from "./system-messages-utils";

export const MAX_ZOOM = 5;
export const MIN_ZOOM = 1;
const ZOOM_INCREMENT = 0.5;
export const MIN_TREE_VIEW_WIDTH = 450;

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
  inputCost: number;
  outputCost: number;
  totalCost: number;
  aggregatedMetrics?: {
    totalCost: number;
    totalTokens: number;
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
  inputCost: number;
  outputCost: number;
  totalCost: number;
  metadata: string;
  status: string;
  traceType: string;
  visibility: "public" | "private";
  hasBrowserSession: boolean;
};

interface RolloutSessionStoreState {
  trace?: TraceViewTrace;
  isTraceLoading: boolean;
  traceError?: string;
  spans: TraceViewSpan[];
  spanPath: string[] | null;
  isSpansLoading: boolean;
  spansError?: string;
  searchEnabled: boolean;
  selectedSpan?: TraceViewSpan;
  browserSession: boolean;
  langGraph: boolean;
  sessionTime?: number;
  tab: "tree" | "timeline" | "chat" | "metadata" | "reader";
  search: string;
  zoom: number;
  treeWidth: number;
  hasBrowserSession: boolean;
  spanTemplates: Record<string, string>;
  spanPathCounts: Map<string, number>;

  // Rollout-specific state
  systemMessagesMap: Map<string, SystemMessage>;
  isSystemMessagesLoading: boolean;
  cachedSpanCounts: Record<string, number>; // Tracks how many spans per path are cached
  overrides: Record<string, { system: string }>; // path -> {system: content} - directly matches backend format
  isRolloutLoading: boolean; // Loading state for both run and cancel operations
  rolloutError?: string;
  sessionStatus: RolloutSessionStatus;
  currentTraceId: string; // Current trace ID for rollout runs

  // Params state
  params: Array<{ name: string; [key: string]: any }>;
  paramValues: Record<string, string>;
}

interface RolloutSessionStoreActions {
  setTrace: (trace?: TraceViewTrace | ((prevTrace?: TraceViewTrace) => TraceViewTrace | undefined)) => void;
  setTraceError: (error?: string) => void;
  setSpans: (spans: TraceViewSpan[] | ((prevSpans: TraceViewSpan[]) => TraceViewSpan[])) => void;
  setSpansError: (error?: string) => void;
  setIsTraceLoading: (isTraceLoading: boolean) => void;
  setIsSpansLoading: (isSpansLoading: boolean) => void;
  setSelectedSpan: (span?: TraceViewSpan) => void;
  selectSpanById: (spanId: string) => void;
  setSpanPath: (spanPath: string[]) => void;
  setSearchEnabled: (searchEnabled: boolean) => void;
  setBrowserSession: (browserSession: boolean) => void;
  setLangGraph: (langGraph: boolean) => void;
  setSessionTime: (time?: number) => void;
  setTab: (tab: RolloutSessionStoreState["tab"]) => void;
  setSearch: (search: string) => void;
  setTreeWidth: (width: number) => void;
  setZoom: (type: "in" | "out") => void;
  setHasBrowserSession: (hasBrowserSession: boolean) => void;
  toggleCollapse: (spanId: string) => void;
  updateTraceVisibility: (visibility: "private" | "public") => void;
  saveSpanTemplate: (spanPathKey: string, template: string) => void;
  deleteSpanTemplate: (spanPathKey: string) => void;
  incrementSessionTime: (increment: number, maxTime: number) => boolean;

  // Selectors
  getTreeSpans: () => TreeSpan[];
  getTimelineData: () => TimelineData;
  getMinimapSpans: () => MinimapSpan[];
  getListMinimapSpans: () => MinimapSpan[];
  getListData: () => TraceViewListSpan[];
  getSpanNameInfo: (spanId: string) => { name: string; count?: number } | undefined;
  getHasLangGraph: () => boolean;
  getSpanBranch: <T extends { spanId: string; parentSpanId?: string }>(span: T) => T[];
  getSpanTemplate: (spanPathKey: string) => string | undefined;
  getSpanAttribute: (spanId: string, attributeKey: string) => any | undefined;
  rebuildSpanPathCounts: () => void;

  // Rollout-specific actions
  setSystemMessagesMap: (
    messages: Map<string, SystemMessage> | ((prev: Map<string, SystemMessage>) => Map<string, SystemMessage>)
  ) => void;
  setIsSystemMessagesLoading: (isLoading: boolean) => void;
  setCachedSpanCounts: (
    cachedSpanCounts: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)
  ) => void;
  toggleOverride: (messageId: string) => void;
  updateOverride: (path: string, content: string) => void;
  isOverrideEnabled: (messageId: string) => boolean;
  resetOverride: (messageId: string) => void;
  cacheToSpan: (span: TraceViewSpan) => void;
  uncacheFromSpan: (span: TraceViewSpan) => void;
  isSpanCached: (span: TraceViewSpan) => boolean;
  getLlmPathCounts: () => Record<string, number>;
  setIsRolloutLoading: (isLoading: boolean) => void;
  setRolloutError: (error?: string) => void;
  setSessionStatus: (status: RolloutSessionStatus) => void;
  setCurrentTraceId: (traceId: string) => void;
  // Rollout session actions
  runRollout: (projectId: string, sessionId: string) => Promise<{ success: boolean; error?: string }>;
  cancelSession: (projectId: string, sessionId: string) => Promise<{ success: boolean; error?: string }>;

  setParamValue: (name: string, value: string) => void;
}

type RolloutSessionStore = RolloutSessionStoreState & RolloutSessionStoreActions;

const createRolloutSessionStore = ({
  trace,
  params = [],
  storeKey = "rollout-session-state",
  initialStatus = "PENDING",
  initialTraceId,
}: {
  trace?: TraceViewTrace;
  params?: Array<{ name: string; [key: string]: any }>;
  storeKey?: string;
  initialStatus?: RolloutSessionStatus;
  initialTraceId: string;
}) => {
  // Initialize paramValues from params
  const initialParamValues = params.reduce(
    (acc, param) => {
      acc[param.name] = "";
      return acc;
    },
    {} as Record<string, string>
  );

  return createStore<RolloutSessionStore>()(
    persist(
      (set, get) => ({
        trace: trace,
        isTraceLoading: false,
        traceError: undefined,
        spans: [],
        isSpansLoading: false,
        spansError: undefined,
        selectedSpan: undefined,
        browserSession: false,
        sessionTime: undefined,
        tab: "tree",
        search: "",
        searchEnabled: false,
        zoom: 1,
        treeWidth: MIN_TREE_VIEW_WIDTH,
        langGraph: false,
        spanPath: null,
        hasBrowserSession: false,
        spanTemplates: {},
        spanPathCounts: new Map(),

        // Rollout-specific state
        systemMessagesMap: new Map(),
        isSystemMessagesLoading: false,
        cachedSpanCounts: {},
        overrides: {},
        isRolloutLoading: false,
        rolloutError: undefined,
        sessionStatus: initialStatus,
        currentTraceId: initialTraceId,

        // Params state (initialized from props)
        params,
        paramValues: initialParamValues,

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
            const newSpans = spans.map((s) => ({ ...s, collapsed: false }));
            set({ spans: newSpans });

            const cachedSpans = newSpans.filter((s) => s.spanType === SpanType.CACHED);
            if (cachedSpans.length > 0) {
              const initialCachedCounts: Record<string, number> = {};
              cachedSpans.forEach((s) => {
                const sPath = s.attributes?.["lmnr.span.path"];
                if (sPath && Array.isArray(sPath)) {
                  const pathKey = sPath.join(".");
                  initialCachedCounts[pathKey] = (initialCachedCounts[pathKey] || 0) + 1;
                }
              });
              // Merge with existing cachedSpanCounts (UI-set cache points take precedence)
              const existingCachedCounts = get().cachedSpanCounts;
              const mergedCachedCounts = { ...initialCachedCounts };
              for (const [path, count] of Object.entries(existingCachedCounts)) {
                mergedCachedCounts[path] = Math.max(mergedCachedCounts[path] || 0, count);
              }
              set({ cachedSpanCounts: mergedCachedCounts });
            }
          }
        },
        setSearchEnabled: (searchEnabled) => set({ searchEnabled }),
        getTreeSpans: () => transformSpansToTree(get().spans),
        getMinimapSpans: () => {
          const trace = get().trace;
          if (trace) {
            const startTime = new Date(trace.startTime).getTime();
            const endTime = new Date(trace.endTime).getTime();
            return transformSpansToMinimap(get().spans, endTime - startTime);
          }
          return [];
        },
        getListMinimapSpans: () => {
          const trace = get().trace;
          const spans = get().spans;
          if (trace) {
            const startTime = new Date(trace.startTime).getTime();
            const endTime = new Date(trace.endTime).getTime();
            const listSpans = spans.filter((span) => span.spanType !== "DEFAULT");
            return transformSpansToFlatMinimap(listSpans, endTime - startTime);
          }
          return [];
        },
        getTimelineData: () => transformSpansToTimeline(get().spans),
        getListData: () => {
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

          const lightweightListSpans: TraceViewListSpan[] = listSpans.map((span) => {
            const parentChain = buildParentChain(span, spanMap);
            return {
              spanId: span.spanId,
              parentSpanId: span.parentSpanId,
              spanType: span.spanType,
              name: span.name,
              model: span.model,
              startTime: span.startTime,
              endTime: span.endTime,
              totalTokens: span.totalTokens,
              totalCost: span.totalCost,
              pending: span.pending,
              pathInfo: buildPathInfo(parentChain, spanNameMap),
            };
          });

          return lightweightListSpans;
        },

        setSelectedSpan: (span) => set({ selectedSpan: span }),
        selectSpanById: (spanId: string) => {
          const span = get().spans.find((s) => s.spanId === spanId);
          if (span && !span.pending) {
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
        setSearch: (search) => set({ search }),
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
        setZoom: (type) => {
          const zoom =
            type === "in"
              ? Math.min(get().zoom + ZOOM_INCREMENT, MAX_ZOOM)
              : Math.max(get().zoom - ZOOM_INCREMENT, MIN_ZOOM);
          set({ zoom });
        },
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
              const pathKey = spanPath.join(".");
              pathCounts.set(pathKey, (pathCounts.get(pathKey) ?? 0) + 1);
            }
          });

          set({ spanPathCounts: pathCounts });
        },

        // Rollout-specific actions
        setSystemMessagesMap: (messages) => {
          if (typeof messages === "function") {
            const prevMessages = get().systemMessagesMap;
            const newMessages = messages(prevMessages);
            set({ systemMessagesMap: newMessages });
          } else {
            set({ systemMessagesMap: messages });
          }
        },

        setIsSystemMessagesLoading: (isLoading) => set({ isSystemMessagesLoading: isLoading }),

        setCachedSpanCounts: (cachedSpanCounts) => {
          if (typeof cachedSpanCounts === "function") {
            const prevCachedSpanCounts = get().cachedSpanCounts;
            const newCachedSpanCounts = cachedSpanCounts(prevCachedSpanCounts);
            set({ cachedSpanCounts: newCachedSpanCounts });
          } else {
            set({ cachedSpanCounts });
          }
        },

        toggleOverride: (messageId: string) => {
          const message = get().systemMessagesMap.get(messageId);
          if (!message) return;

          const overrides = { ...get().overrides };

          if (overrides[message.path]) {
            // Toggle OFF - remove override
            delete overrides[message.path];
          } else {
            // Toggle ON - add override with original content
            overrides[message.path] = { system: message.content };
          }

          set({ overrides });
        },

        updateOverride: (path: string, content: string) => {
          const overrides = { ...get().overrides };
          overrides[path] = { system: content };
          set({ overrides });
        },

        isOverrideEnabled: (messageId: string): boolean => {
          const message = get().systemMessagesMap.get(messageId);
          if (!message) return false;
          return message.path in get().overrides;
        },

        resetOverride: (messageId: string) => {
          const message = get().systemMessagesMap.get(messageId);
          if (!message) return;

          const overrides = { ...get().overrides };
          if (overrides[message.path]) {
            overrides[message.path] = { system: message.content };
            set({ overrides });
          }
        },

        cacheToSpan: (span: TraceViewSpan) => {
          const spans = get().spans;
          const clickedSpanTime = new Date(span.startTime).getTime();

          const spansBeforeOrAt = spans
            .filter((s) => s.spanType === SpanType.LLM || s.spanType === SpanType.CACHED)
            .filter((s) => new Date(s.startTime).getTime() <= clickedSpanTime)
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

          const newCachedCounts: Record<string, number> = {};

          spansBeforeOrAt.forEach((s) => {
            const sPath = s.attributes?.["lmnr.span.path"];
            if (sPath && Array.isArray(sPath)) {
              const pathKey = sPath.join(".");
              newCachedCounts[pathKey] = (newCachedCounts[pathKey] || 0) + 1;
            }
          });

          set({ cachedSpanCounts: newCachedCounts });
        },

        uncacheFromSpan: (span: TraceViewSpan) => {
          const spans = get().spans;
          const clickedSpanTime = new Date(span.startTime).getTime();

          const spansBefore = spans
            .filter((s) => s.spanType === SpanType.LLM || s.spanType === SpanType.CACHED)
            .filter((s) => new Date(s.startTime).getTime() < clickedSpanTime)
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

          const newCachedCounts: Record<string, number> = {};

          spansBefore.forEach((s) => {
            const sPath = s.attributes?.["lmnr.span.path"];
            if (sPath && Array.isArray(sPath)) {
              const pathKey = sPath.join(".");
              newCachedCounts[pathKey] = (newCachedCounts[pathKey] || 0) + 1;
            }
          });

          set({ cachedSpanCounts: newCachedCounts });
        },

        isSpanCached: (span: TraceViewSpan): boolean => {
          const spanPath = span.attributes?.["lmnr.span.path"];
          if (!spanPath || !Array.isArray(spanPath)) return false;

          const spanPathKey = spanPath.join(".");
          const cacheCount = get().cachedSpanCounts[spanPathKey];

          if (!cacheCount) return false;

          const spans = get().spans;
          const spansWithSamePath = spans
            .filter((s) => s.spanType === SpanType.LLM || s.spanType === SpanType.CACHED)
            .filter((s) => {
              const sPath = s.attributes?.["lmnr.span.path"];
              return sPath && Array.isArray(sPath) && sPath.join(".") === spanPathKey;
            })
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

          const spanIndex = spansWithSamePath.findIndex((s) => s.spanId === span.spanId);

          return spanIndex !== -1 && spanIndex < cacheCount;
        },

        getLlmPathCounts: (): Record<string, number> => {
          const pathMap: Record<string, number> = {};

          get()
            .spans.filter((s) => s.spanType === SpanType.LLM || s.spanType === SpanType.CACHED)
            .forEach((span) => {
              const spanPath = span.attributes?.["lmnr.span.path"];
              if (spanPath && Array.isArray(spanPath)) {
                const pathKey = spanPath.join(".");
                pathMap[pathKey] = (pathMap[pathKey] || 0) + 1;
              }
            });

          return pathMap;
        },

        setIsRolloutLoading: (isRolloutLoading: boolean) => set({ isRolloutLoading }),
        setRolloutError: (rolloutError?: string) => set({ rolloutError }),
        setSessionStatus: (sessionStatus: RolloutSessionStatus) => set({ sessionStatus }),
        setCurrentTraceId: (currentTraceId: string) => set({ currentTraceId }),

        runRollout: async (projectId: string, sessionId: string) => {
          try {
            set({ isRolloutLoading: true, rolloutError: undefined });

            // Clear all spans before running rollout
            set({ spans: [] });
            const overrides = get().overrides;
            const currentTraceId = get().currentTraceId;
            const cachedSpanCounts = get().cachedSpanCounts;
            const paramValues = get().paramValues;

            const rolloutPayload: Record<string, any> = {};

            if (currentTraceId) {
              rolloutPayload.trace_id = currentTraceId;
            }

            if (Object.keys(cachedSpanCounts).length > 0) {
              rolloutPayload.path_to_count = cachedSpanCounts;
            }

            const nonEmptyParams = Object.entries(paramValues).reduce(
              (acc, [key, value]) => {
                if (value && value.trim() !== "") {
                  acc[key] = value;
                }
                return acc;
              },
              {} as Record<string, string>
            );
            if (Object.keys(nonEmptyParams).length > 0) {
              rolloutPayload.args = nonEmptyParams;
            }

            if (Object.keys(overrides).length > 0) {
              rolloutPayload.overrides = overrides;
            }

            const response = await fetch(`/api/projects/${projectId}/rollout-sessions/${sessionId}/run`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(rolloutPayload),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
              throw new Error(errorData.error || "Failed to run rollout");
            }

            await response.json();
            set({ sessionStatus: "RUNNING" });

            return { success: true };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to run rollout";
            set({ rolloutError: errorMessage });
            return { success: false, error: errorMessage };
          } finally {
            set({ isRolloutLoading: false });
          }
        },

        cancelSession: async (projectId: string, sessionId: string) => {
          try {
            set({ isRolloutLoading: true });

            const response = await fetch(`/api/projects/${projectId}/rollout-sessions/${sessionId}/status`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "STOPPED" }),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
              throw new Error(errorData.error || "Failed to cancel rollout");
            }

            set({ sessionStatus: "STOPPED" });
            return { success: true };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to cancel rollout";
            return { success: false, error: errorMessage };
          } finally {
            set({ isRolloutLoading: false });
          }
        },

        setParamValue: (name, value) => {
          set((state) => ({
            paramValues: { ...state.paramValues, [name]: value },
          }));
        },
      }),
      {
        name: storeKey,
        partialize: (state) => ({
          treeWidth: state.treeWidth,
          spanPath: state.spanPath,
          spanTemplates: state.spanTemplates,
          tab: state.tab,
        }),
      }
    )
  );
};

const RolloutSessionStoreContext = createContext<StoreApi<RolloutSessionStore> | undefined>(undefined);

const RolloutSessionStoreProvider = ({
  trace,
  params,
  storeKey,
  initialStatus,
  initialTraceId,
  children,
}: PropsWithChildren<{
  trace?: TraceViewTrace;
  params?: Array<{ name: string; [key: string]: any }>;
  storeKey?: string;
  initialStatus?: RolloutSessionStatus;
  initialTraceId: string;
}>) => {
  const storeRef = useRef<StoreApi<RolloutSessionStore>>(undefined);

  if (!storeRef.current) {
    storeRef.current = createRolloutSessionStore({ trace, params, storeKey, initialStatus, initialTraceId });
  }

  return <RolloutSessionStoreContext.Provider value={storeRef.current}>{children}</RolloutSessionStoreContext.Provider>;
};

export const useRolloutSessionStoreContext = <T,>(selector: (store: RolloutSessionStore) => T): T => {
  const store = useContext(RolloutSessionStoreContext);
  if (!store) {
    throw new Error("useRolloutSessionStoreContext must be used within a RolloutSessionStoreContext");
  }

  return useStore(store, selector);
};

export const useRolloutSessionStore = () => {
  const store = useContext(RolloutSessionStoreContext);
  if (!store) {
    throw new Error("useRolloutSessionStore must be used within a RolloutSessionStoreContext");
  }
  return store;
};

export default RolloutSessionStoreProvider;
