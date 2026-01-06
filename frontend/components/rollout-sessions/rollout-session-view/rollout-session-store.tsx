import { get, has } from "lodash";
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

// Incoming realtime span (may be missing some TraceViewSpan fields)
export type RealtimeSpanInput = {
  spanId: string;
  parentSpanId?: string;
  traceId: string;
  spanType: SpanType;
  name: string;
  startTime: string;
  endTime: string;
  attributes: Record<string, any>;
  status?: string;
  // Optional fields that TraceViewSpan requires but RealtimeSpan may not have
  path?: string;
  events?: Event[];
  model?: string;
  pending?: boolean;
  collapsed?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputCost?: number;
  outputCost?: number;
  totalCost?: number;
  aggregatedMetrics?: TraceViewSpan["aggregatedMetrics"];
};

function toTraceViewSpan(incoming: TraceViewSpan | RealtimeSpanInput): TraceViewSpan {
  const attrs = incoming.attributes || {};

  const spanPath = attrs["lmnr.span.path"];
  const path = incoming.path ?? (Array.isArray(spanPath) ? spanPath.join(".") : "");

  const model = incoming.model ?? get(attrs, "gen_ai.response.model") ?? get(attrs, "gen_ai.request.model") ?? "";

  // Derive token/cost metrics from attributes
  const inputTokens = incoming.inputTokens ?? get(attrs, "gen_ai.usage.input_tokens", 0);
  const outputTokens = incoming.outputTokens ?? get(attrs, "gen_ai.usage.output_tokens", 0);
  const totalTokens = incoming.totalTokens ?? get(attrs, "llm.usage.total_tokens", inputTokens + outputTokens);
  const inputCost = incoming.inputCost ?? get(attrs, "gen_ai.usage.input_cost", 0);
  const outputCost = incoming.outputCost ?? get(attrs, "gen_ai.usage.output_cost", 0);
  const totalCost = incoming.totalCost ?? get(attrs, "gen_ai.usage.cost", inputCost + outputCost);

  return {
    spanId: incoming.spanId,
    parentSpanId: incoming.parentSpanId,
    traceId: incoming.traceId,
    name: incoming.name,
    startTime: incoming.startTime,
    endTime: incoming.endTime,
    attributes: attrs,
    spanType: incoming.spanType,
    path,
    events: incoming.events ?? [],
    status: incoming.status,
    model,
    pending: incoming.pending ?? false,
    collapsed: incoming.collapsed ?? false,
    inputTokens,
    outputTokens,
    totalTokens,
    inputCost,
    outputCost,
    totalCost,
    aggregatedMetrics: incoming.aggregatedMetrics,
  };
}

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
  pathToCount: Record<string, number>;
  editedMessages: Map<string, string>; // messageId -> edited content
  isRolloutRunning: boolean;
  rolloutError?: string;
  sessionStatus: RolloutSessionStatus;

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
  addSpanIfNew: (span: TraceViewSpan | RealtimeSpanInput) => boolean;

  // Rollout-specific actions
  setSystemMessagesMap: (
    messages: Map<string, SystemMessage> | ((prev: Map<string, SystemMessage>) => Map<string, SystemMessage>)
  ) => void;
  setIsSystemMessagesLoading: (isLoading: boolean) => void;
  setPathToCount: (
    pathToCount: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)
  ) => void;
  setEditedMessage: (messageId: string, content: string) => void;
  resetEditedMessage: (messageId: string) => void;
  getEditedContent: (messageId: string) => string | undefined;
  getOverridesForRollout: () => Record<string, { system: string }>;
  setCachePoint: (span: TraceViewSpan) => void;
  unlockFromSpan: (span: TraceViewSpan) => void;
  isSpanCached: (span: TraceViewSpan) => boolean;
  getLlmPathCounts: () => Record<string, number>;
  setIsRolloutRunning: (isRunning: boolean) => void;
  setRolloutError: (error?: string) => void;
  setSessionStatus: (status: RolloutSessionStatus) => void;
  removeNonCachedSpans: () => void;

  setParamValue: (name: string, value: string) => void;
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
        pathToCount: {},
        editedMessages: new Map(),
        isRolloutRunning: false,
        rolloutError: undefined,
        sessionStatus: initialStatus,

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
              const initialPathToCount: Record<string, number> = {};
              cachedSpans.forEach((s) => {
                const sPath = s.attributes?.["lmnr.span.path"];
                if (sPath && Array.isArray(sPath)) {
                  const pathKey = sPath.join(".");
                  initialPathToCount[pathKey] = (initialPathToCount[pathKey] || 0) + 1;
                }
              });
              // Merge with existing pathToCount (UI-set cache points take precedence)
              const existingPathToCount = get().pathToCount;
              const mergedPathToCount = { ...initialPathToCount };
              for (const [path, count] of Object.entries(existingPathToCount)) {
                mergedPathToCount[path] = Math.max(mergedPathToCount[path] || 0, count);
              }
              set({ pathToCount: mergedPathToCount });
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
        addSpanIfNew: (rawSpan: TraceViewSpan | RealtimeSpanInput): boolean => {
          // Convert incoming span to TraceViewSpan format
          const incomingSpan = toTraceViewSpan(rawSpan);
          const incomingPath = incomingSpan.attributes?.["lmnr.span.path"];

          if (!incomingPath || !Array.isArray(incomingPath)) {
            const exists = get().spans.some((s) => s.spanId === incomingSpan.spanId);
            if (!exists) {
              get().setSpans((prevSpans) => [...prevSpans, incomingSpan]);
              return true;
            }
            return false;
          }

          const pathKey = incomingPath.join(".");
          const incomingPathCount = incomingSpan.attributes?.["lmnr.rollout.path.index"];

          // If no path count attribute, just add as new span
          if (incomingPathCount === undefined || incomingPathCount === null) {
            get().setSpans((prevSpans) => [...prevSpans, incomingSpan]);
            // Update span path counts for the new span
            const currentCount = get().spanPathCounts.get(pathKey) ?? 0;
            get().spanPathCounts.set(pathKey, currentCount + 1);
            return true;
          }

          // Find existing span with same path AND same path count
          const existingSpanWithSameCount = get().spans.find((s) => {
            const sPath = s.attributes?.["lmnr.span.path"];
            if (!sPath || !Array.isArray(sPath)) return false;
            if (sPath.join(".") !== pathKey) return false;
            const sPathCount = s.attributes?.["lmnr.rollout.path.index"];
            return sPathCount === incomingPathCount;
          });

          if (existingSpanWithSameCount) {
            // Replace the existing span with same path and count
            get().setSpans((prevSpans) =>
              prevSpans.map((s) =>
                s.spanId === existingSpanWithSameCount.spanId ? { ...incomingSpan, collapsed: s.collapsed } : s
              )
            );
            return true;
          }

          const originalSpansWithPath = get()
            .spans.filter((span) => {
              const sPath = span.attributes?.["lmnr.span.path"];
              if (!sPath || !Array.isArray(sPath)) return false;
              if (sPath.join(".") !== pathKey) return false;
              // Only consider spans without path count as "original"
              return span.attributes?.["lmnr.rollout.path.index"] === undefined;
            })
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

          // path count is 1-indexed, so we need to get the (pathCount - 1)th original span
          const targetIndex = incomingPathCount - 1;
          if (targetIndex >= 0 && targetIndex < originalSpansWithPath.length) {
            const spanToReplace = originalSpansWithPath[targetIndex];
            get().setSpans((prevSpans) =>
              prevSpans.map((s) =>
                s.spanId === spanToReplace.spanId ? { ...incomingSpan, collapsed: s.collapsed } : s
              )
            );
            return true;
          }

          // No original span to replace at this index - add as new
          get().setSpans((prevSpans) => [...prevSpans, incomingSpan]);
          // Update span path counts for the new span
          const currentCount = get().spanPathCounts.get(pathKey) ?? 0;
          get().spanPathCounts.set(pathKey, currentCount + 1);
          return true;
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

        setPathToCount: (pathToCount) => {
          if (typeof pathToCount === "function") {
            const prevPathToCount = get().pathToCount;
            const newPathToCount = pathToCount(prevPathToCount);
            set({ pathToCount: newPathToCount });
          } else {
            set({ pathToCount });
          }
        },

        setEditedMessage: (messageId: string, content: string) => {
          const newMap = new Map(get().editedMessages);
          const originalMessage = get().systemMessagesMap.get(messageId);
          // Only store if different from original
          if (originalMessage && content !== originalMessage.content) {
            newMap.set(messageId, content);
          } else {
            newMap.delete(messageId);
          }
          set({ editedMessages: newMap });
        },

        resetEditedMessage: (messageId: string) => {
          const newMap = new Map(get().editedMessages);
          newMap.delete(messageId);
          set({ editedMessages: newMap });
        },

        getEditedContent: (messageId: string) => get().editedMessages.get(messageId),

        getOverridesForRollout: () => {
          const overrides: Record<string, { system: string }> = {};
          const systemMessages = get().systemMessagesMap;
          const editedMessages = get().editedMessages;

          // For each edited message, use its path to create the override
          for (const [messageId, editedContent] of editedMessages.entries()) {
            const message = systemMessages.get(messageId);
            if (message && message.path) {
              overrides[message.path] = { system: editedContent };
            }
          }

          return overrides;
        },

        setCachePoint: (span: TraceViewSpan) => {
          const spans = get().spans;
          const clickedSpanTime = new Date(span.startTime).getTime();

          const spansBeforeOrAt = spans
            .filter((s) => s.spanType === SpanType.LLM || s.spanType === SpanType.CACHED)
            .filter((s) => new Date(s.startTime).getTime() <= clickedSpanTime)
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

          const newPathToCount: Record<string, number> = {};

          spansBeforeOrAt.forEach((s) => {
            const sPath = s.attributes?.["lmnr.span.path"];
            if (sPath && Array.isArray(sPath)) {
              const pathKey = sPath.join(".");
              newPathToCount[pathKey] = (newPathToCount[pathKey] || 0) + 1;
            }
          });

          set({ pathToCount: newPathToCount });
        },

        unlockFromSpan: (span: TraceViewSpan) => {
          const spans = get().spans;
          const clickedSpanTime = new Date(span.startTime).getTime();

          const spansBefore = spans
            .filter((s) => s.spanType === SpanType.LLM || s.spanType === SpanType.CACHED)
            .filter((s) => new Date(s.startTime).getTime() < clickedSpanTime)
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

          const newPathToCount: Record<string, number> = {};

          spansBefore.forEach((s) => {
            const sPath = s.attributes?.["lmnr.span.path"];
            if (sPath && Array.isArray(sPath)) {
              const pathKey = sPath.join(".");
              newPathToCount[pathKey] = (newPathToCount[pathKey] || 0) + 1;
            }
          });

          set({ pathToCount: newPathToCount });
        },

        isSpanCached: (span: TraceViewSpan): boolean => {
          if (span.spanType === SpanType.CACHED) return true;

          const spanPath = span.attributes?.["lmnr.span.path"];
          if (!spanPath || !Array.isArray(spanPath)) return false;

          const spanPathKey = spanPath.join(".");
          const cacheCount = get().pathToCount[spanPathKey];

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

        setIsRolloutRunning: (isRolloutRunning: boolean) => set({ isRolloutRunning }),
        setRolloutError: (rolloutError?: string) => set({ rolloutError }),
        setSessionStatus: (sessionStatus: RolloutSessionStatus) => set({ sessionStatus }),

        removeNonCachedSpans: () => {
          const spans = get().spans;
          const pathToCount = get().pathToCount;

          if (Object.keys(pathToCount).length === 0) {
            return;
          }

          let cutoffTime = 0;
          for (const [pathKey, count] of Object.entries(pathToCount)) {
            if (count <= 0) continue;

            const spansWithPath = spans
              .filter((s) => s.spanType === SpanType.LLM || s.spanType === SpanType.CACHED)
              .filter((s) => {
                const sPath = s.attributes?.["lmnr.span.path"];
                return sPath && Array.isArray(sPath) && sPath.join(".") === pathKey;
              })
              .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

            const lastCachedIndex = Math.min(count - 1, spansWithPath.length - 1);
            if (lastCachedIndex >= 0 && spansWithPath[lastCachedIndex]) {
              const spanEndTime = new Date(spansWithPath[lastCachedIndex].endTime).getTime();
              cutoffTime = Math.max(cutoffTime, spanEndTime);
            }
          }

          if (cutoffTime > 0) {
            const filteredSpans = spans.filter((s) => new Date(s.startTime).getTime() <= cutoffTime);
            set({ spans: filteredSpans });
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
