import type { LaminarAgentContextKey } from "./store";

export type Suggestion = {
  display: string;
  prompt: string;
};

export const contextSuggestions: Record<LaminarAgentContextKey, Suggestion[]> = {
  traceView: [
    { display: "Summarize this trace", prompt: "Summarize the trace I'm looking at" },
    { display: "Find errors in this trace", prompt: "Are there any errors or failures in this trace?" },
    { display: "Show the slowest spans", prompt: "Which spans in this trace took the longest?" },
    { display: "Explain the trace flow", prompt: "Walk me through the execution flow of this trace step by step" },
    { display: "Check token usage", prompt: "What is the total token usage and cost breakdown for this trace?" },
  ],
  signal: [
    {
      display: "Explain recent signals",
      prompt: "Query the signal_events table and explain the most recent signal events",
    },
    { display: "Signal event count", prompt: "How many signal events were detected today?" },
    { display: "Most common signals", prompt: "What are the most frequently triggered signals?" },
    { display: "Signals with failures", prompt: "Show me signal events that detected failures in recent traces" },
  ],
};

export const defaultSuggestions: Suggestion[] = [
  { display: "Ask Laminar Agent", prompt: "What can you help me with?" },
  { display: "Query platform data", prompt: "Show me a summary of recent traces" },
  { display: "Find recent errors", prompt: "Are there any errors in recent traces?" },
  { display: "Cost breakdown", prompt: "What is the total cost and token usage across traces today?" },
];
