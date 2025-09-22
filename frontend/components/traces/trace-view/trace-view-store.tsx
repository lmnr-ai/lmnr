import { has } from "lodash";
import { createContext, PropsWithChildren, useContext, useMemo, useRef } from "react";
import { createStore, StoreApi, useStore } from "zustand";
import { persist } from "zustand/middleware";

import {
  MinimapSpan,
  TimelineData,
  transformSpansToMinimap,
  transformSpansToTimeline,
  transformSpansToTree,
  TreeSpan,
} from "@/components/traces/trace-view/trace-view-store-utils.ts";
import { Event } from "@/lib/events/types";
import { SPAN_KEYS } from "@/lib/lang-graph/types";
import { SpanType } from "@/lib/traces/types";

export const MAX_ZOOM = 5;
export const MIN_ZOOM = 1;
const ZOOM_INCREMENT = 0.5;
export const MIN_TREE_VIEW_WIDTH = 450;

export type TraceViewSpan = {
  spanId: string;
  parentSpanId?: string | null;
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
  trace_type: string;
  visibility: "public" | "private";
};

interface TraceViewStoreState {
  trace?: TraceViewTrace;
  isTraceLoading: boolean;
  spans: TraceViewSpan[];
  spanPath: string[] | null;
  isSpansLoading: boolean;
  searchEnabled: boolean;
  selectedSpan?: TraceViewSpan;
  browserSession: boolean;
  langGraph: boolean;
  sessionTime?: number;
  tab: "tree" | "timeline" | "chat";
  search: string;
  zoom: number;
  treeWidth: number;
  hasBrowserSession: boolean;
}

interface TraceViewStoreActions {
  setTrace: (trace?: TraceViewTrace) => void;
  updateTrace: (updater: (trace: TraceViewTrace) => TraceViewTrace) => void;
  setSpans: (spans: TraceViewSpan[]) => void;
  updateSpans: (updater: (spans: TraceViewSpan[]) => TraceViewSpan[]) => void;
  setIsTraceLoading: (isTraceLoading: boolean) => void;
  setIsSpansLoading: (isSpansLoading: boolean) => void;
  setSelectedSpan: (span?: TraceViewSpan) => void;
  setSpanPath: (spanPath: string[]) => void;
  setSearchEnabled: (searchEnabled: boolean) => void;
  setBrowserSession: (browserSession: boolean) => void;
  setLangGraph: (langGraph: boolean) => void;
  setSessionTime: (time?: number) => void;
  setTab: (tab: TraceViewStoreState["tab"]) => void;
  setSearch: (search: string) => void;
  setTreeWidth: (width: number) => void;
  setZoom: (type: "in" | "out") => void;
  setHasBrowserSession: (hasBrowserSession: boolean) => void;
  toggleCollapse: (spanId: string) => void;
  updateTraceVisibility: (visibility: "private" | "public") => void;

  incrementSessionTime: (increment: number, maxTime: number) => boolean;
  // Selectors
  getTreeSpans: () => TreeSpan[];
  getTimelineData: () => TimelineData;
  getMinimapSpans: () => MinimapSpan[];
  getHasLangGraph: () => boolean;
}

type TraceViewStore = TraceViewStoreState & TraceViewStoreActions;

const createTraceViewStore = () =>
  createStore<TraceViewStore>()(
    persist(
      (set, get) => ({
        trace: undefined,
        isTraceLoading: false,
        spans: [],
        isSpansLoading: false,
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

        setHasBrowserSession: (hasBrowserSession: boolean) => set({ hasBrowserSession }),
        setTrace: (trace) => set({ trace }),
        updateTrace: (updater) => {
          const trace = get().trace;
          if (trace) {
            set({ trace: updater(trace) });
          }
        },
        updateTraceVisibility: (visibility) => {
          const trace = get().trace;
          if (trace) {
            set({ trace: { ...trace, visibility } });
          }
        },
        setSpans: (spans) => set({ spans: spans.map((s) => ({ ...s, collapsed: false })) }),
        updateSpans: (updater) => {
          const spans = get().spans;
          set({ spans: updater(spans) });
        },
        setSearchEnabled: (searchEnabled) => set({ searchEnabled }),
        getTreeSpans: () => transformSpansToTree(get().spans),
        getMinimapSpans: () => {
          const trace = get().trace;
          if (trace) {
            const startTime = new Date(trace?.startTime || 0).getTime();
            const endTime = new Date(trace?.endTime || 0).getTime();
            return transformSpansToMinimap(get().spans, endTime - startTime);
          }
          return [];
        },
        getTimelineData: () => transformSpansToTimeline(get().spans),

        setSelectedSpan: (span) => set({ selectedSpan: span }),
        setSessionTime: (sessionTime) => set({ sessionTime }),
        setIsTraceLoading: (isTraceLoading) => set({ isTraceLoading }),
        setIsSpansLoading: (isSpansLoading) => set({ isSpansLoading }),
        setLangGraph: (langGraph: boolean) => set({ langGraph }),
        setTab: (tab) => {
          const storeTab = get().tab;
          if (tab === storeTab) {
            set({ tab: "tree" });
          } else {
            set({ tab });
          }
        },
        incrementSessionTime: (increment: number, maxTime: number) => {
          const currentTime = get().sessionTime || 0;
          const newTime = Math.min(currentTime + increment, maxTime);
          set({ sessionTime: newTime });
          return newTime >= maxTime;
        },
        setSearch: (search) => set({ search }),
        setTreeWidth: (treeWidth) => set({ treeWidth }),
        setZoom: (type) => {
          const zoom =
            type === "in"
              ? Math.min(get().zoom + ZOOM_INCREMENT, MAX_ZOOM)
              : Math.max(get().zoom - ZOOM_INCREMENT, MIN_ZOOM);
          set({ zoom });
        },
        setBrowserSession: (browserSession: boolean) => set({ browserSession }),
        toggleCollapse: (spanId: string) => {
          const { spans } = get();
          set({
            spans: spans.map((span) => (span.spanId === spanId ? { ...span, collapsed: !span.collapsed } : span)),
          });
        },
        setSpanPath: (spanPath) => set({ spanPath }),
        getHasLangGraph: () =>
          !!get().spans.find(
            (s) => s.attributes && has(s.attributes, SPAN_KEYS.NODES) && has(s.attributes, SPAN_KEYS.EDGES)
          ),
      }),
      {
        name: "trace-view-state",
        partialize: (state) => ({
          treeWidth: state.treeWidth,
          spanPath: state.spanPath,
        }),
      }
    )
  );

const TraceViewStoreContext = createContext<StoreApi<TraceViewStore> | undefined>(undefined);

const TraceViewStoreProvider = ({ children }: PropsWithChildren) => {
  const storeRef = useRef<StoreApi<TraceViewStore>>(undefined);

  if (!storeRef.current) {
    storeRef.current = createTraceViewStore();
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

export const useOptionalTraceViewStoreContext = <T,>(selector: (store: TraceViewStore) => T, defaultValue: T): T => {
  const store = useContext(TraceViewStoreContext);

  return useMemo(() => {
    if (!store) {
      return defaultValue;
    }
    return selector(store.getState());
  }, [store, selector, defaultValue]);
};

export default TraceViewStoreProvider;
