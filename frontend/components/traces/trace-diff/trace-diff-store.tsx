"use client";

import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi, useStore } from "zustand";

import {
  type TraceViewListSpan,
  type TraceViewSpan,
  type TraceViewTrace,
} from "@/components/traces/trace-view/store/base";
import { toListSpans } from "@/components/traces/trace-view/store/utils";

import { type BlockSummary, type CondensedBlock, type SpanTreeNode } from "./timeline/timeline-types";
import { assignBlockRows, buildSpanTree, computeMaxDepth, getBlocksAtDepth } from "./timeline/timeline-utils";
import { type DiffRow, type SpanMapping } from "./trace-diff-types";
import { computeAlignedRows } from "./trace-diff-utils";

export type DiffPhase = "selecting" | "loading" | "error" | "ready";

interface TraceDiffState {
  phase: DiffPhase;

  leftTrace?: TraceViewTrace;
  leftSpans: TraceViewSpan[];
  leftListSpans: TraceViewListSpan[];
  isLeftLoading: boolean;

  rightTrace?: TraceViewTrace;
  rightSpans: TraceViewSpan[];
  rightListSpans: TraceViewListSpan[];
  isRightLoading: boolean;

  spanMapping: SpanMapping;
  isMappingLoading: boolean;
  mappingError: string | null;
  alignedRows: DiffRow[];
  retryCounter: number;

  selectedRowIndex: number | null;

  // Timeline state
  viewMode: "list" | "timeline";
  timelineDepth: number;
  maxTreeDepth: number;
  leftTree: SpanTreeNode[] | null;
  rightTree: SpanTreeNode[] | null;
  leftBlocks: CondensedBlock[];
  rightBlocks: CondensedBlock[];
  blockSummaries: Record<string, BlockSummary>;
  isSummarizationLoading: boolean;
  selectedBlockSpanId: string | null;
  selectedBlockSide: "left" | "right" | null;
}

interface TraceDiffActions {
  setLeftData: (trace: TraceViewTrace, spans: TraceViewSpan[]) => void;
  setRightData: (trace: TraceViewTrace, spans: TraceViewSpan[]) => void;
  setIsLeftLoading: (loading: boolean) => void;
  setIsRightLoading: (loading: boolean) => void;
  setIsMappingLoading: (loading: boolean) => void;
  setMapping: (mapping: SpanMapping) => void;
  setMappingError: (error: string) => void;
  retryMapping: () => void;
  toggleRow: (index: number) => void;
  clearSelection: () => void;
  reset: () => void;

  // Timeline actions
  setViewMode: (mode: "list" | "timeline") => void;
  setTimelineDepth: (depth: number) => void;
  expandOneLevel: () => void;
  addBlockSummaries: (summaries: Record<string, BlockSummary>) => void;
  setIsSummarizationLoading: (loading: boolean) => void;
  selectBlock: (spanId: string, side: "left" | "right") => void;
  clearBlockSelection: () => void;
}

export type TraceDiffStore = TraceDiffState & TraceDiffActions;

const initialState: TraceDiffState = {
  phase: "selecting",
  leftSpans: [],
  leftListSpans: [],
  isLeftLoading: true,
  rightSpans: [],
  rightListSpans: [],
  isRightLoading: false,
  spanMapping: [],
  isMappingLoading: false,
  mappingError: null,
  alignedRows: [],
  retryCounter: 0,
  selectedRowIndex: null,

  // Timeline
  viewMode: "list",
  timelineDepth: 0,
  maxTreeDepth: 0,
  leftTree: null,
  rightTree: null,
  leftBlocks: [],
  rightBlocks: [],
  blockSummaries: {},
  isSummarizationLoading: false,
  selectedBlockSpanId: null,
  selectedBlockSide: null,
};

const createTraceDiffStore = () =>
  createStore<TraceDiffStore>()((set, get) => ({
    ...initialState,

    setLeftData: (trace, spans) => {
      const listSpans = toListSpans(spans);
      const hasRight = !!get().rightTrace;
      const leftTree = buildSpanTree(spans);
      const rightTree = get().rightTree;
      const maxTreeDepth = Math.max(computeMaxDepth(leftTree), rightTree ? computeMaxDepth(rightTree) : 0);
      const timelineDepth = maxTreeDepth;

      set({
        leftTrace: trace,
        leftSpans: spans,
        leftListSpans: listSpans,
        isLeftLoading: false,
        leftTree,
        maxTreeDepth,
        timelineDepth,
        leftBlocks: assignBlockRows(getBlocksAtDepth(leftTree, timelineDepth)),
        rightBlocks: rightTree ? assignBlockRows(getBlocksAtDepth(rightTree, timelineDepth)) : [],
        // If right trace exists, reset mapping state so it re-runs
        ...(hasRight
          ? {
              phase: "loading" as DiffPhase,
              spanMapping: [],
              alignedRows: [],
              selectedRowIndex: null,
              mappingError: null,
            }
          : {}),
      });
    },

    setRightData: (trace, spans) => {
      const listSpans = toListSpans(spans);
      const rightTree = buildSpanTree(spans);
      const leftTree = get().leftTree;
      const maxTreeDepth = Math.max(leftTree ? computeMaxDepth(leftTree) : 0, computeMaxDepth(rightTree));
      const timelineDepth = maxTreeDepth;

      set({
        rightTrace: trace,
        rightSpans: spans,
        rightListSpans: listSpans,
        isRightLoading: false,
        phase: "loading",
        rightTree,
        maxTreeDepth,
        timelineDepth,
        leftBlocks: leftTree ? assignBlockRows(getBlocksAtDepth(leftTree, timelineDepth)) : [],
        rightBlocks: assignBlockRows(getBlocksAtDepth(rightTree, timelineDepth)),
      });
    },

    setIsLeftLoading: (loading) => set({ isLeftLoading: loading }),
    setIsRightLoading: (loading) => set({ isRightLoading: loading }),
    setIsMappingLoading: (loading) => set({ isMappingLoading: loading }),

    setMapping: (mapping) => {
      const { leftListSpans, rightListSpans } = get();
      const alignedRows = computeAlignedRows(leftListSpans, rightListSpans, mapping);
      set({
        spanMapping: mapping,
        alignedRows,
        isMappingLoading: false,
        mappingError: null,
        phase: "ready",
      });
    },

    setMappingError: (error) =>
      set({
        mappingError: error,
        isMappingLoading: false,
        phase: "error",
      }),

    retryMapping: () =>
      set((s) => ({
        mappingError: null,
        isMappingLoading: true,
        phase: "loading" as DiffPhase,
        retryCounter: s.retryCounter + 1,
      })),

    toggleRow: (index) => set((s) => ({ selectedRowIndex: s.selectedRowIndex === index ? null : index })),
    clearSelection: () => set({ selectedRowIndex: null }),

    reset: () =>
      set({
        ...initialState,
        leftTrace: get().leftTrace,
        leftSpans: get().leftSpans,
        leftListSpans: get().leftListSpans,
        isLeftLoading: false,
      }),

    // Timeline actions
    setViewMode: (mode) => {
      const s = get();
      if (mode === "timeline" && s.leftTree) {
        // Recompute blocks at current depth when switching to timeline
        set({
          viewMode: mode,
          leftBlocks: assignBlockRows(getBlocksAtDepth(s.leftTree, s.timelineDepth)),
          rightBlocks: s.rightTree ? assignBlockRows(getBlocksAtDepth(s.rightTree, s.timelineDepth)) : [],
          selectedBlockSpanId: null,
          selectedBlockSide: null,
        });
      } else {
        set({ viewMode: mode });
      }
    },

    setTimelineDepth: (depth) => {
      const { leftTree, rightTree } = get();
      set({
        timelineDepth: depth,
        leftBlocks: leftTree ? assignBlockRows(getBlocksAtDepth(leftTree, depth)) : [],
        rightBlocks: rightTree ? assignBlockRows(getBlocksAtDepth(rightTree, depth)) : [],
      });
    },

    expandOneLevel: () => {
      const { timelineDepth, maxTreeDepth } = get();
      if (timelineDepth < maxTreeDepth) {
        get().setTimelineDepth(timelineDepth + 1);
      }
    },

    addBlockSummaries: (summaries) =>
      set((s) => ({
        blockSummaries: { ...s.blockSummaries, ...summaries },
      })),

    setIsSummarizationLoading: (loading) => set({ isSummarizationLoading: loading }),

    selectBlock: (spanId, side) => set({ selectedBlockSpanId: spanId, selectedBlockSide: side }),

    clearBlockSelection: () => set({ selectedBlockSpanId: null, selectedBlockSide: null }),
  }));

const TraceDiffStoreContext = createContext<StoreApi<TraceDiffStore> | undefined>(undefined);

export const TraceDiffStoreProvider = ({ children }: PropsWithChildren) => {
  const [store] = useState(createTraceDiffStore);
  return <TraceDiffStoreContext.Provider value={store}>{children}</TraceDiffStoreContext.Provider>;
};

export const useTraceDiffStore = <T,>(selector: (store: TraceDiffStore) => T): T => {
  const store = useContext(TraceDiffStoreContext);
  if (!store) {
    throw new Error("useTraceDiffStore must be used within a TraceDiffStoreProvider");
  }
  return useStore(store, selector);
};
