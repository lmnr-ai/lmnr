export type Suggestion = {
  display: string;
  prompt: string;
};

/**
 * Map of URL route patterns (glob-like) to contextual suggestions.
 * Patterns are matched in order; the first match wins.
 *
 * Each route should have >3 suggestions so the collapsed cycler has variety
 * and the open-chat empty state can pick 3 to display.
 */
const routeSuggestions: Array<{
  pattern: RegExp;
  /** If true, the route also requires `traceId` in the search params to match. */
  requiresTraceIdParam?: boolean;
  suggestions: Suggestion[];
}> = [
  {
    // Trace detail page: /project/{id}/traces with ?traceId= in search params
    pattern: /^\/project\/[^/]+\/traces$/,
    requiresTraceIdParam: true,
    suggestions: [
      { display: "Summarize this trace", prompt: "Summarize the trace I'm looking at" },
      { display: "Find errors in this trace", prompt: "Are there any errors or failures in this trace?" },
      { display: "Show the slowest spans", prompt: "Which spans in this trace took the longest?" },
      { display: "Explain the trace flow", prompt: "Walk me through the execution flow of this trace step by step" },
      { display: "Check token usage", prompt: "What is the total token usage and cost breakdown for this trace?" },
    ],
  },
  {
    // Traces list page (no traceId selected)
    pattern: /^\/project\/[^/]+\/traces$/,
    suggestions: [
      { display: "Find recent errors", prompt: "Are there any errors in recent traces?" },
      { display: "Show slowest traces", prompt: "What are the slowest traces in the last hour?" },
      { display: "Trace cost summary", prompt: "Show me the total cost and token usage across recent traces" },
      { display: "Count traces today", prompt: "How many traces were recorded today?" },
    ],
  },
  {
    pattern: /^\/project\/[^/]+\/signals/,
    suggestions: [
      {
        display: "Explain recent signals",
        prompt: "Query the signal_events table and explain the most recent signal events",
      },
      { display: "Signal event count", prompt: "How many signal events were detected today?" },
      { display: "Most common signals", prompt: "What are the most frequently triggered signals?" },
      { display: "Signals with failures", prompt: "Show me signal events that detected failures in recent traces" },
    ],
  },
  {
    pattern: /^\/project\/[^/]+\/evaluations/,
    suggestions: [
      { display: "Evaluation overview", prompt: "Show me a summary of recent evaluation runs" },
      { display: "Compare scores", prompt: "What are the average scores across recent evaluations?" },
      { display: "Failed evaluations", prompt: "Show me evaluations with low scores or failures" },
      { display: "Latest eval results", prompt: "What are the results of the most recent evaluation?" },
    ],
  },
  {
    pattern: /^\/project\/[^/]+\/dashboard/,
    suggestions: [
      { display: "Platform summary", prompt: "Give me an overview of platform activity today" },
      { display: "Cost analysis", prompt: "What is the total cost of traces today?" },
      { display: "Error rate", prompt: "What is the current error rate across all traces?" },
      { display: "Recent activity", prompt: "Show me a summary of recent traces and their status" },
    ],
  },
  {
    // General fallback for any project page
    pattern: /^\/project\//,
    suggestions: [
      { display: "Ask Laminar Agent", prompt: "What can you help me with?" },
      { display: "Query platform data", prompt: "Show me a summary of recent traces" },
      { display: "Find recent errors", prompt: "Are there any errors in recent traces?" },
      { display: "Cost breakdown", prompt: "What is the total cost and token usage across traces today?" },
    ],
  },
];

/**
 * Returns the list of suggestions matching the current pathname and search params.
 * Falls back to general suggestions if no specific pattern matches.
 */
export function getSuggestionsForRoute(pathname: string, searchParams?: string): Suggestion[] {
  for (const entry of routeSuggestions) {
    if (entry.pattern.test(pathname)) {
      if (entry.requiresTraceIdParam) {
        // Only match if traceId is present in search params
        const params = new URLSearchParams(searchParams ?? "");
        if (!params.has("traceId")) continue;
      }
      return entry.suggestions;
    }
  }
  return [];
}
