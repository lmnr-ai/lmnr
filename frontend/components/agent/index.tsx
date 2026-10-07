"use client";

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

// Stub barrel of the Laminar Agent — the agent UI is not part of the open-source distribution.
// In `lmnr-private` this same path re-exports the real implementation from `./private`; shared
// surfaces (project layout, headers, trace view, dataset/evaluation pages) import from
// `@/components/agent`, so those files stay byte-identical across distributions while this barrel
// swaps between the real agent and these no-ops. Only the panel open/collapse state is kept;
// context registration and name reporting are no-ops.

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

export const useLaminarAgentStore = <T,>(selector: (state: LaminarAgentStore) => T): T =>
  laminarAgentStore(useShallow(selector));

export const useReportAgentContextName = (_key: AgentContextKey, _name: string | null | undefined): void => {};

export function RouteAgentContext() {
  return null;
}

export function TraceAgentContext(_props: { traceId: string }) {
  return null;
}

export function AgentHeaderToggle() {
  return null;
}

export default function LaminarAgent() {
  return null;
}
