"use client";

import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";

// POC top-area modes (Round 6): the real-estate model for surfacing mocked
// issue clusters above the compact-v1 table. "scores" is the baseline
// (bare MetricsPanel, current behavior).
export const POC_TOP_MODES = ["scores", "tabs", "chips", "banner", "rail"] as const;
export type PocTopMode = (typeof POC_TOP_MODES)[number];

export const TOP_MODE_LABELS: Record<PocTopMode, string> = {
  scores: "Scores only",
  tabs: "Tabs (Scores / Issues)",
  chips: "Chips row",
  banner: "Banner (expand on demand)",
  rail: "Side rail",
};

export function usePocTop() {
  const [topMode, setTopMode] = useQueryState("pocTop", parseAsStringLiteral(POC_TOP_MODES).withDefault("scores"));
  const [issueId, setIssueId] = useQueryState("pocIssue", parseAsString);
  const toggleIssue = (id: string) => setIssueId((current) => (current === id ? null : id));
  return { topMode, setTopMode, issueId, setIssueId, toggleIssue };
}
