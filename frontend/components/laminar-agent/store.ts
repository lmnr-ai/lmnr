import { create } from "zustand";

export type AgentViewMode = "fullscreen" | "collapsed" | "sidebar" | "floating";

export interface LaminarAgentState {
  viewMode: AgentViewMode;
  suggestions: string[];
}

export interface LaminarAgentActions {
  setViewMode: (mode: AgentViewMode) => void;
  setSuggestions: (suggestions: string[]) => void;
}

export type LaminarAgentStore = LaminarAgentState & LaminarAgentActions;

export const useLaminarAgentStore = create<LaminarAgentStore>((set) => ({
  viewMode: "collapsed",
  suggestions: [],
  setViewMode: (viewMode) => set({ viewMode }),
  setSuggestions: (suggestions) => set({ suggestions }),
}));
