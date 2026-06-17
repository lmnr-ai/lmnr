"use client";

// Filler store. The real Laminar Agent lives in lmnr-private; this stub exists only so the OSS
// shared surfaces (project layout, dataset / evaluation / queue / signal pages, signal-details)
// compile against the same import surface. It carries no agent logic.

type AgentContextKey = "trace" | "signal" | "evaluation" | "dataset" | "labelingQueue" | "session";

export const laminarAgentStore = {
  getState: () => ({
    setPrefillInput: (_text: string | null) => {},
  }),
};

export const useReportAgentContextName = (_key: AgentContextKey, _name: string | null | undefined): void => {};
