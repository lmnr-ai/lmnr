import { has } from "lodash";
import { createContext, type PropsWithChildren, useContext, useRef } from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import { persist } from "zustand/middleware";

import { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/trace-view-store.tsx";
import {
  buildParentChain,
  buildPathInfo,
  buildSpanNameMap,
  computePathInfoMap,
  groupIntoSections,
  type MinimapSpan,
  type TimelineData,
  transformSpansToFlatMinimap,
  transformSpansToMinimap,
  transformSpansToTimeline,
  transformSpansToTree,
  type TreeSpan,
} from "@/components/traces/trace-view/trace-view-store-utils.ts";
import { type RolloutSessionStatus } from "@/lib/actions/rollout-sessions";
import { SPAN_KEYS } from "@/lib/lang-graph/types";
import { SpanType } from "@/lib/traces/types";
import { tryParseJson } from "@/lib/utils.ts";

import { type SystemMessage } from "./system-messages-utils";

export const MAX_ZOOM = 5;
export const MIN_ZOOM = 1;
const ZOOM_INCREMENT = 0.5;
export const MIN_SIDEBAR_WIDTH = 450;

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
  cacheReadInputTokens?: number;
  pending?: boolean;
  pathInfo: {
    display: Array<{ spanId: string; name: string; count?: number }>;
    full: Array<{ spanId: string; name: string }>;
  } | null;
};

interface RolloutSessionStoreState {
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
  tab: "tree" | "timeline" | "reader";
  zoom: number;
  sidebarWidth: number;
  hasBrowserSession: boolean;
  spanTemplates: Record<string, string>;
  spanPathCounts: Map<string, number>;
  showTreeContent: boolean;

  // Rollout-specific state
  systemMessagesMap: Map<string, SystemMessage>;
  isSystemMessagesLoading: boolean;
  cachedSpanCounts: Record<string, number>; // Tracks how many spans per path are cached
  overrides: Record<string, { system: string }>; // path -> {system: content} - directly matches backend format
  isRolloutLoading: boolean; // Loading state for both run and cancel operations
  rolloutError?: string;
  sessionStatus: RolloutSessionStatus;
  isSessionDeleted: boolean;
  // Params state
  params: Array<{ name: string; [key: string]: any }>;
  paramValues: string; // JSON string that can be either array or object
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
  setBrowserSession: (browserSession: boolean) => void;
  setLangGraph: (langGraph: boolean) => void;
  setSessionTime: (time?: number) => void;
  setTab: (tab: RolloutSessionStoreState["tab"]) => void;
  setSidebarWidth: (width: number) => void;
  setZoom: (type: "in" | "out") => void;
  setHasBrowserSession: (hasBrowserSession: boolean) => void;
  toggleCollapse: (spanId: string) => void;
  updateTraceVisibility: (visibility: "private" | "public") => void;
  saveSpanTemplate: (spanPathKey: string, template: string) => void;
  deleteSpanTemplate: (spanPathKey: string) => void;
  setShowTreeContent: (show: boolean) => void;
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
  updateOverride: (pathKey: string, content: string) => void;
  isOverrideEnabled: (messageId: string) => boolean;
  resetOverride: (messageId: string) => void;
  cacheToSpan: (span: TraceViewSpan) => void;
  uncacheFromSpan: (span: TraceViewSpan) => void;
  isSpanCached: (span: TraceViewSpan) => boolean;
  getLlmPathCounts: () => Record<string, number>;
  setIsRolloutLoading: (isLoading: boolean) => void;
  setRolloutError: (error?: string) => void;
  setSessionStatus: (status: RolloutSessionStatus) => void;
  setIsSessionDeleted: (isSessionDeleted: boolean) => void;
  // Rollout session actions
  runRollout: (projectId: string, sessionId: string) => Promise<{ success: boolean; error?: string }>;
  cancelSession: (projectId: string, sessionId: string) => Promise<{ success: boolean; error?: string }>;

  setParamValue: (value: string) => void;
}

type RolloutSessionStore = RolloutSessionStoreState & RolloutSessionStoreActions;

const createRolloutSessionStore = ({
  trace,
  params = [],
  storeKey = "rollout-session-state",
  initialStatus = "PENDING",
}: {
  trace?: TraceViewTrace;
  params?: Array<{ name: string; [key: string]: any }>;
  storeKey?: string;
  initialStatus?: RolloutSessionStatus;
}) =>
  createStore<RolloutSessionStore>()(
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
        zoom: 1,
        sidebarWidth: MIN_SIDEBAR_WIDTH,
        langGraph: false,
        spanPath: null,
        hasBrowserSession: false,
        spanTemplates: {},
        spanPathCounts: new Map(),
        showTreeContent: true,

        // Rollout-specific state
        systemMessagesMap: new Map(),
        isSystemMessagesLoading: false,
        cachedSpanCounts: {},
        overrides: {},
        isRolloutLoading: false,
        rolloutError: undefined,
        sessionStatus: initialStatus,
        isSessionDeleted: false,
        // Params state (initialized from props)
        params,
        paramValues: "" as string, // Empty JSON string initially

        setHasBrowserSession: (hasBrowserSession: boolean) => set({ hasBrowserSession }),
        getTreeSpans: () => {
          const spans = get().spans;
          const pathInfoMap = computePathInfoMap(spans);
          return transformSpansToTree(spans, pathInfoMap);
        },
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
          let newSpans: TraceViewSpan[];

          if (typeof spans === "function") {
            const prevSpans = get().spans;
            newSpans = spans(prevSpans);
          } else {
            newSpans = spans.map((s) => ({ ...s, collapsed: false }));
          }

          set({ spans: newSpans });

          // Update cachedSpanCounts based on CACHED spans in the new spans
          const cachedSpans = newSpans.filter((s) => s.spanType === SpanType.CACHED);
          if (cachedSpans.length > 0) {
            const newCachedCounts: Record<string, number> = {};
            cachedSpans.forEach((s) => {
              const sPath = s.attributes?.["lmnr.span.path"];
              if (sPath && Array.isArray(sPath)) {
                const pathKey = sPath.join(".");
                newCachedCounts[pathKey] = (newCachedCounts[pathKey] || 0) + 1;
              }
            });
            set({ cachedSpanCounts: newCachedCounts });
          }
        },
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
              cacheReadInputTokens: span.cacheReadInputTokens,
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
        setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
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

          if (overrides[message.pathKey]) {
            // Toggle OFF - remove override
            delete overrides[message.pathKey];
          } else {
            // Toggle ON - add override with original content
            overrides[message.pathKey] = { system: message.content };
          }

          set({ overrides });
        },

        updateOverride: (pathKey: string, content: string) => {
          const overrides = { ...get().overrides };
          overrides[pathKey] = { system: content };
          set({ overrides });
        },

        isOverrideEnabled: (messageId: string): boolean => {
          const message = get().systemMessagesMap.get(messageId);
          if (!message) return false;
          return message.pathKey in get().overrides;
        },

        resetOverride: (messageId: string) => {
          const message = get().systemMessagesMap.get(messageId);
          if (!message) return;

          const overrides = { ...get().overrides };
          if (overrides[message.pathKey]) {
            overrides[message.pathKey] = { system: message.content };
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

        runRollout: async (projectId: string, sessionId: string) => {
          try {
            set({ isRolloutLoading: true, rolloutError: undefined });

            // Clear all spans and reset cached span counts before running rollout
            const overrides = get().overrides;
            const currentTraceId = get()?.trace?.id;
            const cachedSpanCounts = get().cachedSpanCounts;
            const paramValues = get().paramValues;

            const rolloutPayload: Record<string, any> = {};

            set({ spans: [], cachedSpanCounts: {}, trace: undefined });
            if (currentTraceId) {
              rolloutPayload.trace_id = currentTraceId;
            }

            if (Object.keys(cachedSpanCounts).length > 0) {
              rolloutPayload.path_to_count = cachedSpanCounts;
            }

            if (paramValues && paramValues.trim() !== "") {
              rolloutPayload.args = tryParseJson(paramValues);
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
        setIsSessionDeleted: (isSessionDeleted: boolean) => set({ isSessionDeleted }),

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

        setParamValue: (value: string) => {
          set({ paramValues: value });
        },
      }),
      {
        name: storeKey,
        partialize: (state) => {
          const persistentTabs = ["tree", "timeline", "reader"] as const;
          const tabToPersist = persistentTabs.includes(state.tab as any) ? state.tab : undefined;

          return {
            sidebarWidth: state.sidebarWidth,
            spanPath: state.spanPath,
            spanTemplates: state.spanTemplates,
            ...(tabToPersist && { tab: tabToPersist }),
            showTreeContent: state.showTreeContent,
          };
        },
      }
    )
  );

const RolloutSessionStoreContext = createContext<StoreApi<RolloutSessionStore> | undefined>(undefined);

const RolloutSessionStoreProvider = ({
  trace,
  params,
  storeKey,
  initialStatus,
  children,
}: PropsWithChildren<{
  trace?: TraceViewTrace;
  params?: Array<{ name: string; [key: string]: any }>;
  storeKey?: string;
  initialStatus?: RolloutSessionStatus;
}>) => {
  const storeRef = useRef<StoreApi<RolloutSessionStore>>(undefined);

  if (!storeRef.current) {
    storeRef.current = createRolloutSessionStore({ trace, params, storeKey, initialStatus });
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
