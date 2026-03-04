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
import {
  buildSpanTree,
  computeBlocksWithLayout,
  computeExpandedLayout,
  computeMaxDepth,
} from "./timeline/timeline-utils";
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
  leftExpandedRowMap: Map<string, number>;
  rightExpandedRowMap: Map<string, number>;
  leftTotalRows: number;
  rightTotalRows: number;
  leftBlocks: CondensedBlock[];
  rightBlocks: CondensedBlock[];
  blockSummaries: Record<string, BlockSummary>;
  timelineZoom: number;
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
  setTimelineZoom: (zoom: number) => void;
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
  leftExpandedRowMap: new Map(),
  rightExpandedRowMap: new Map(),
  leftTotalRows: 0,
  rightTotalRows: 0,
  leftBlocks: [],
  rightBlocks: [],
  blockSummaries: {},
  timelineZoom: 1,
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
      const { rowMap: leftExpandedRowMap, totalRows: leftTotalRows } = computeExpandedLayout(leftTree);
      const rightTree = get().rightTree;
      const rightExpandedRowMap = get().rightExpandedRowMap;
      const maxTreeDepth = Math.max(computeMaxDepth(leftTree), rightTree ? computeMaxDepth(rightTree) : 0);
      const timelineDepth = maxTreeDepth;

      set({
        leftTrace: trace,
        leftSpans: spans,
        leftListSpans: listSpans,
        isLeftLoading: false,
        leftTree,
        leftExpandedRowMap,
        leftTotalRows,
        maxTreeDepth,
        timelineDepth,
        leftBlocks: computeBlocksWithLayout(leftTree, timelineDepth, leftExpandedRowMap),
        rightBlocks: rightTree ? computeBlocksWithLayout(rightTree, timelineDepth, rightExpandedRowMap) : [],
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
      const { rowMap: rightExpandedRowMap, totalRows: rightTotalRows } = computeExpandedLayout(rightTree);
      const leftTree = get().leftTree;
      const leftExpandedRowMap = get().leftExpandedRowMap;
      const maxTreeDepth = Math.max(leftTree ? computeMaxDepth(leftTree) : 0, computeMaxDepth(rightTree));
      const timelineDepth = maxTreeDepth;

      set({
        rightTrace: trace,
        rightSpans: spans,
        rightListSpans: listSpans,
        isRightLoading: false,
        phase: "loading",
        rightTree,
        rightExpandedRowMap,
        rightTotalRows,
        maxTreeDepth,
        timelineDepth,
        leftBlocks: leftTree ? computeBlocksWithLayout(leftTree, timelineDepth, leftExpandedRowMap) : [],
        rightBlocks: computeBlocksWithLayout(rightTree, timelineDepth, rightExpandedRowMap),
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
        set({
          viewMode: mode,
          leftBlocks: computeBlocksWithLayout(s.leftTree, s.timelineDepth, s.leftExpandedRowMap),
          rightBlocks: s.rightTree ? computeBlocksWithLayout(s.rightTree, s.timelineDepth, s.rightExpandedRowMap) : [],
          selectedBlockSpanId: null,
          selectedBlockSide: null,
        });
      } else {
        set({ viewMode: mode });
      }
    },

    setTimelineDepth: (depth) => {
      const { leftTree, rightTree, leftExpandedRowMap, rightExpandedRowMap } = get();
      set({
        timelineDepth: depth,
        leftBlocks: leftTree ? computeBlocksWithLayout(leftTree, depth, leftExpandedRowMap) : [],
        rightBlocks: rightTree ? computeBlocksWithLayout(rightTree, depth, rightExpandedRowMap) : [],
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

    setTimelineZoom: (zoom) => set({ timelineZoom: Math.max(1, Math.min(18, zoom)) }),

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
