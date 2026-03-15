/**
 * URL-based context extraction and suggestion tree for Laminar Agent.
 * Source of truth for current page is usePathname() — this module
 * provides pure functions that accept a pathname string.
 */

export interface PageContext {
  /** Human-readable page type, e.g. "traces list", "trace detail" */
  pageType: string;
  /** Extracted entity IDs from the URL */
  ids: Record<string, string>;
  /** System prompt fragment describing what the user is looking at */
  systemPromptFragment: string;
  /** Contextual suggestions for this page */
  suggestions: string[];
}

const DEFAULT_SUGGESTIONS = [
  "How many traces did I receive today?",
  "Show me my most used models",
  "What are the most common errors?",
  "What is my total cost this week?",
];

interface RouteMatch {
  pattern: RegExp;
  pageType: string;
  extractIds: (match: RegExpMatchArray) => Record<string, string>;
  promptFragment: (ids: Record<string, string>) => string;
  suggestions: string[];
}

const ROUTE_MATCHES: RouteMatch[] = [
  {
    pattern: /\/project\/([^/]+)\/traces\/([^/]+)/,
    pageType: "trace detail",
    extractIds: (m) => ({ projectId: m[1], traceId: m[2] }),
    promptFragment: (ids) =>
      `The user is viewing a specific trace (ID: ${ids.traceId}). They can see the trace timeline, spans, and details. You can use getTraceSkeleton with this trace ID to help answer questions about it.`,
    suggestions: [
      "Summarize this trace",
      "What went wrong here?",
      "Which spans took the longest?",
      "What models were used in this trace?",
    ],
  },
  {
    pattern: /\/project\/([^/]+)\/traces/,
    pageType: "traces list",
    extractIds: (m) => ({ projectId: m[1] }),
    promptFragment: () =>
      "The user is on the traces list page. They can see a table of recent traces with names, durations, costs, and statuses.",
    suggestions: [
      "Show me recent failed traces",
      "What's my average latency?",
      "Which endpoints are slowest?",
      "Show trace volume by hour",
    ],
  },
  {
    pattern: /\/project\/([^/]+)\/evaluations\/([^/]+)/,
    pageType: "evaluation detail",
    extractIds: (m) => ({ projectId: m[1], evaluationId: m[2] }),
    promptFragment: (ids) =>
      `The user is viewing a specific evaluation (ID: ${ids.evaluationId}). They can see evaluation scores, datapoints, and results.`,
    suggestions: [
      "Compare this eval to the last one",
      "Which scores dropped?",
      "What's the average score?",
      "Show the worst performing datapoints",
    ],
  },
  {
    pattern: /\/project\/([^/]+)\/evaluations/,
    pageType: "evaluations list",
    extractIds: (m) => ({ projectId: m[1] }),
    promptFragment: () =>
      "The user is on the evaluations list page. They can see a list of evaluation runs with their scores and statuses.",
    suggestions: [
      "Compare this eval to the last one",
      "Which scores dropped?",
      "Show evaluation trends over time",
      "What's my best performing evaluation?",
    ],
  },
  {
    pattern: /\/project\/([^/]+)\/dashboard/,
    pageType: "dashboard",
    extractIds: (m) => ({ projectId: m[1] }),
    promptFragment: () =>
      "The user is on the dashboard page. They can see overview metrics, charts, and key performance indicators.",
    suggestions: [
      "What are my top endpoints?",
      "Show trace volume by hour",
      "What's my cost trend this week?",
      "Which models have the highest latency?",
    ],
  },
  {
    pattern: /\/project\/([^/]+)\/signals/,
    pageType: "signals",
    extractIds: (m) => ({ projectId: m[1] }),
    promptFragment: () => "The user is on the signals page. They can see configured signals and recent signal events.",
    suggestions: [
      "Which signals fired today?",
      "Show me the most active signals",
      "Are there any error patterns I should monitor?",
      "Create a signal for failed traces",
    ],
  },
  {
    pattern: /\/project\/([^/]+)\/datasets/,
    pageType: "datasets",
    extractIds: (m) => ({ projectId: m[1] }),
    promptFragment: () => "The user is on the datasets page. They can see dataset collections used for evaluations.",
    suggestions: [
      "How many datapoints are in my datasets?",
      "Which dataset was last updated?",
      "Show me dataset usage in evaluations",
    ],
  },
  {
    pattern: /\/project\/([^/]+)\/sql/,
    pageType: "SQL editor",
    extractIds: (m) => ({ projectId: m[1] }),
    promptFragment: () =>
      "The user is on the SQL editor page. They can write and execute SQL queries against their project data.",
    suggestions: [
      "What tables are available?",
      "Show me a query for trace latency distribution",
      "How do I query token usage by model?",
    ],
  },
  {
    pattern: /\/project\/([^/]+)\/agent/,
    pageType: "agent",
    extractIds: (m) => ({ projectId: m[1] }),
    promptFragment: () => "The user is on the Laminar Agent full-screen page.",
    suggestions: DEFAULT_SUGGESTIONS,
  },
  {
    pattern: /\/project\/([^/]+)/,
    pageType: "project",
    extractIds: (m) => ({ projectId: m[1] }),
    promptFragment: () => "The user is in a project page.",
    suggestions: DEFAULT_SUGGESTIONS,
  },
];

/**
 * Parse a pathname and return contextual information about the current page.
 */
export function getPageContext(pathname: string): PageContext {
  for (const route of ROUTE_MATCHES) {
    const match = pathname.match(route.pattern);
    if (match) {
      const ids = route.extractIds(match);
      return {
        pageType: route.pageType,
        ids,
        systemPromptFragment: route.promptFragment(ids),
        suggestions: route.suggestions,
      };
    }
  }

  return {
    pageType: "unknown",
    ids: {},
    systemPromptFragment: "The user is on a Laminar platform page.",
    suggestions: DEFAULT_SUGGESTIONS,
  };
}

/**
 * Get a single contextual suggestion for display below the chat input.
 * Rotates through available suggestions based on a seed (e.g. timestamp).
 */
export function getRotatingSuggestion(suggestions: string[], seed: number): string {
  if (suggestions.length === 0) return DEFAULT_SUGGESTIONS[0];
  return suggestions[seed % suggestions.length];
}
