import { has } from "lodash";
import { createContext, PropsWithChildren, useContext, useRef } from "react";
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
import { SPAN_KEYS } from "@/lib/lang-graph/types.ts";
import { Span, Trace } from "@/lib/traces/types.ts";

const MAX_ZOOM = 5;
const MIN_ZOOM = 1;
const ZOOM_INCREMENT = 0.5;
const MIN_TREE_VIEW_WIDTH = 450;

export type TraceViewSpan = Span & { collapsed: boolean };

interface TraceViewStoreState {
  trace?: Trace;
  isTraceLoading: boolean;
  spans: TraceViewSpan[];
  isSpansLoading: boolean;
  selectedSpan?: TraceViewSpan;
  browserSession: boolean;
  langGraph: boolean;
  sessionTime?: number;
  tab: "tree" | "timeline" | "chat";
  search: string;
  zoom: number;
  treeWidth: number;
}

interface TraceViewStoreActions {
  setTrace: (trace?: Trace) => void;
  setSpans: (spans: Span[]) => void;
  setIsTraceLoading: (isTraceLoading: boolean) => void;
  setIsSpansLoading: (isSpansLoading: boolean) => void;
  setSelectedSpan: (span?: TraceViewSpan) => void;
  setBrowserSession: (browserSession: boolean) => void;
  setLangGraph: (langGraph: boolean) => void;
  setSessionTime: (time?: number) => void;
  setTab: (tab: TraceViewStoreState["tab"]) => void;
  setSearch: (search: string) => void;
  setTreeWidth: (width: number) => void;
  setZoom: (type: "in" | "out") => void;
  toggleCollapse: (spanId: string) => void;

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
        zoom: 1,
        treeWidth: MIN_TREE_VIEW_WIDTH,
        langGraph: false,

        setTrace: (trace) => set({ trace }),
        setSpans: (spans) => set({ spans: spans.map((s) => ({ ...s, collapsed: false })) }),
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
        getHasLangGraph: () =>
          !!get().spans.find(
            (s) => s.attributes && has(s.attributes, SPAN_KEYS.NODES) && has(s.attributes, SPAN_KEYS.EDGES)
          ),
      }),
      {
        name: "trace-view-state",
        partialize: (state) => ({
          treeWidth: state.treeWidth,
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

export default TraceViewStoreProvider;
