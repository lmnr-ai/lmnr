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
      "Analyze this trace for issues",
      "Why did this trace fail?",
      "What's the slowest part of this trace?",
      "Compare this trace to similar ones",
    ],
  },
  {
    pattern: /\/project\/([^/]+)\/traces/,
    pageType: "traces list",
    extractIds: (m) => ({ projectId: m[1] }),
    promptFragment: () =>
      "The user is on the traces list page. They can see a table of recent traces with names, durations, costs, and statuses.",
    suggestions: [
      "Find traces with errors in the last hour",
      "Show me my slowest endpoints",
      "Analyze my latency trends today",
      "What's causing the most failures?",
    ],
  },
  {
    pattern: /\/project\/([^/]+)\/evaluations\/([^/]+)/,
    pageType: "evaluation detail",
    extractIds: (m) => ({ projectId: m[1], evaluationId: m[2] }),
    promptFragment: (ids) =>
      `The user is viewing a specific evaluation (ID: ${ids.evaluationId}). They can see evaluation scores, datapoints, and results.`,
    suggestions: [
      "Analyze this evaluation's weak spots",
      "Compare this eval to the previous run",
      "Which scores regressed the most?",
      "Find the worst performing datapoints",
    ],
  },
  {
    pattern: /\/project\/([^/]+)\/evaluations/,
    pageType: "evaluations list",
    extractIds: (m) => ({ projectId: m[1] }),
    promptFragment: () =>
      "The user is on the evaluations list page. They can see a list of evaluation runs with their scores and statuses.",
    suggestions: [
      "Which evaluation had the biggest score drop?",
      "Show me evaluation trends this week",
      "Find evaluations with failing scores",
      "Compare my latest two evaluations",
    ],
  },
  {
    pattern: /\/project\/([^/]+)\/dashboard/,
    pageType: "dashboard",
    extractIds: (m) => ({ projectId: m[1] }),
    promptFragment: () =>
      "The user is on the dashboard page. They can see overview metrics, charts, and key performance indicators.",
    suggestions: [
      "Analyze my error rate trend today",
      "Which endpoints need optimization?",
      "Show me cost anomalies this week",
      "What's driving my highest latency?",
    ],
  },
  {
    pattern: /\/project\/([^/]+)\/signals/,
    pageType: "signals",
    extractIds: (m) => ({ projectId: m[1] }),
    promptFragment: () => "The user is on the signals page. They can see configured signals and recent signal events.",
    suggestions: [
      "Which signals are firing the most?",
      "Create a signal for error rate spikes",
      "Are there error patterns I'm not monitoring?",
      "Show me signals that need attention",
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
 * Parse a pathname (and optional search params) and return contextual
 * information about the current page. Search params are used because
 * some pages encode entity IDs as query params (e.g. ?traceId=xxx on
 * the traces list page) rather than path segments.
 */
export function getPageContext(pathname: string, searchParams?: URLSearchParams): PageContext {
  for (const route of ROUTE_MATCHES) {
    const match = pathname.match(route.pattern);
    if (match) {
      const ids = route.extractIds(match);

      // Check for traceId in query params (traces list page opens traces this way)
      if (searchParams) {
        const qTraceId = searchParams.get("traceId");
        if (qTraceId && !ids.traceId) {
          const traceDetailRoute = ROUTE_MATCHES.find((r) => r.pageType === "trace detail");
          if (traceDetailRoute) {
            const traceIds: Record<string, string> = { ...ids, traceId: qTraceId };
            const qSpanId = searchParams.get("spanId");
            if (qSpanId) traceIds.spanId = qSpanId;
            return {
              pageType: traceDetailRoute.pageType,
              ids: traceIds,
              systemPromptFragment: traceDetailRoute.promptFragment(traceIds),
              suggestions: traceDetailRoute.suggestions,
            };
          }
        }
      }

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
