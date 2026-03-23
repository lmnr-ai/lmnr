"use client";

import { create } from "zustand";

export interface AIPageContext {
  /** The current page/route the user is viewing */
  currentPage: string;
  /** Current project ID */
  projectId?: string;
  /** Trace view context */
  traceView?: {
    traceId: string;
    traceStartTime?: string;
    traceEndTime?: string;
    traceStatus?: string;
    selectedSpanId?: string;
    selectedSpanName?: string;
  };
  /** Evaluation context */
  evaluation?: {
    evaluationId: string;
    evaluationName?: string;
    selectedTraceId?: string;
    selectedDatapointId?: string;
    targetId?: string;
    scores?: string[];
  };
}

interface AIChatState {
  /** Whether the side panel is open */
  isOpen: boolean;
  /** The current page context for AI chat */
  pageContext: AIPageContext;
}

interface AIChatActions {
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setPageContext: (context: Partial<AIPageContext>) => void;
  setTraceViewContext: (ctx: AIPageContext["traceView"]) => void;
  setEvaluationContext: (ctx: AIPageContext["evaluation"]) => void;
  clearTraceViewContext: () => void;
  clearEvaluationContext: () => void;
}

type AIChatStore = AIChatState & AIChatActions;

export const useAIChatStore = create<AIChatStore>((set) => ({
  isOpen: false,
  pageContext: {
    currentPage: "",
  },

  setOpen: (open) => set({ isOpen: open }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  setPageContext: (context) =>
    set((state) => ({
      pageContext: { ...state.pageContext, ...context },
    })),
  setTraceViewContext: (ctx) =>
    set((state) => ({
      pageContext: { ...state.pageContext, traceView: ctx },
    })),
  setEvaluationContext: (ctx) =>
    set((state) => ({
      pageContext: { ...state.pageContext, evaluation: ctx },
    })),
  clearTraceViewContext: () =>
    set((state) => ({
      pageContext: { ...state.pageContext, traceView: undefined },
    })),
  clearEvaluationContext: () =>
    set((state) => ({
      pageContext: { ...state.pageContext, evaluation: undefined },
    })),
}));
