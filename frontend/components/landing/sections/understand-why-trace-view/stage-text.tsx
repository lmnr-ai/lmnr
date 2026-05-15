// Stage union for the unified scroll-locked narrative.
//
//   1 — Slack notification
//   2 — Slack morphs into Signal event card
//   3 — Trace view materializes around the signal card (header + transcript)
//   4 — Condensed timeline appears
//   5 — Screen recording appears
//   6 — Span view + chat-with-trace expand to the right
export type Stage = 1 | 2 | 3 | 4 | 5 | 6;

export type TraceStage = 3 | 4 | 5 | 6;

// Title + (optional) subtitle for each trace substage. Title is required;
// subtitle is shown when present and the paragraph collapses when absent.
// `\n` in either field renders as a line break (parent uses
// `whitespace-pre-line`).
export const TRACE_STAGE_TEXTS: Record<TraceStage, { title: string; subtitle?: string }> = {
  3: {
    title: "A clear, concise view\nof your agent run.",
    subtitle:
      "Transcript view surfaces what's important. Extracted trace input, tool calls, LLM calls, and sub-agents.",
  },
  4: { title: "See every action\non a timeline." },
  5: { title: "And a screen recording\nof your agent's browser." },
  6: { title: "Long complex run?\nChat with AI about it." },
};

export const TRACE_LEARN_MORE = {
  label: "Learn more about trace view",
  href: "https://laminar.sh/docs/tracing",
};
