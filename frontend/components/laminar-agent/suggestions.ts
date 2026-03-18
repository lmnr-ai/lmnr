export type Suggestion = {
  display: string;
  prompt: string;
};

/**
 * Map of URL route patterns (glob-like) to contextual suggestions.
 * Patterns are matched in order; the first match wins.
 */
const routeSuggestions: Array<{ pattern: RegExp; suggestions: Suggestion[] }> = [
  {
    pattern: /^\/project\/[^/]+\/traces\/[^/]+/,
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
 * Returns the list of suggestions matching the current pathname.
 * Falls back to general suggestions if no specific pattern matches.
 */
export function getSuggestionsForRoute(pathname: string): Suggestion[] {
  for (const entry of routeSuggestions) {
    if (entry.pattern.test(pathname)) {
      return entry.suggestions;
    }
  }
  return [];
}
