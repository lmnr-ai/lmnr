export type Suggestion = {
  display: string;
  prompt: string;
};

/**
 * Map of URL route patterns (glob-like) to contextual suggestions.
 * Patterns are matched in order; the first match wins.
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
    ],
  },
  {
    pattern: /^\/project\/[^/]+\/signals/,
    suggestions: [
      {
        display: "Explain recent signals",
        prompt: "Query the signal_events table and explain the most recent signal events",
      },
    ],
  },
  {
    // General fallback for any project page
    pattern: /^\/project\//,
    suggestions: [
      { display: "Ask Laminar Agent", prompt: "What can you help me with?" },
      { display: "Query platform data", prompt: "Show me a summary of recent traces" },
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
