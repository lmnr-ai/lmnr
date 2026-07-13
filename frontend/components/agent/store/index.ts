"use client";

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

// Stub of the Laminar Agent store — the agent UI is not part of the open-source distribution, but
// shared surfaces (trace header, dataset/evaluation pages) reference it so the files stay identical
// across distributions. Only the panel open/collapse state is kept; context registration is a no-op.

export type AgentViewMode = "collapsed" | "open";

export type AgentContextKey = "trace" | "signal" | "evaluation" | "dataset" | "labelingQueue" | "session";

interface LaminarAgentStore {
  viewMode: AgentViewMode;
  setViewMode: (viewMode: AgentViewMode) => void;
  open: () => void;
  collapse: () => void;
}

export const laminarAgentStore = create<LaminarAgentStore>()((set) => ({
  viewMode: "collapsed",
  setViewMode: (viewMode) => set({ viewMode }),
  open: () => set({ viewMode: "open" }),
  collapse: () => set({ viewMode: "collapsed" }),
}));

export const useLaminarAgentStore = <T>(selector: (state: LaminarAgentStore) => T): T =>
  laminarAgentStore(useShallow(selector));

export const useReportAgentContextName = (_key: AgentContextKey, _name: string | null | undefined): void => {};
