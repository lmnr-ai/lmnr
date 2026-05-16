// Stage union for the unified scroll-locked narrative.
//
//   1 — Slack notification
//   2 — Slack morphs into Signal event card
//   3 — Trace view materializes around the signal card (header + transcript)
//   4 — Condensed timeline appears
//   5 — Span view + chat-with-trace expand to the right
//
// Stages 2-5 all live under one "Understand why in seconds" text phase —
// the title stays put while the bento animates underneath. Only the
// subtitle changes per stage (and only stages 3-5 carry one).
//
// Browser-session recording is NOT stage-driven — the Media header button
// is the only way to open/close it. Its dedicated stage was removed.
export type Stage = 1 | 2 | 3 | 4 | 5;

// Per-stage subtitle for phase 2. Stages without an entry render no
// subtitle (the title sits alone).
export const PHASE_2_SUBTITLES: Partial<Record<Stage, string>> = {
  3: "Go from issue description to the exact step that caused it. Laminar makes the agent run navigable by surfacing input, LLM reasoning, tool calls, and sub-agents as a readable transcript.",
  4: "See every action on a timeline.",
  5: "Long complex run? Chat with AI about it.",
};
