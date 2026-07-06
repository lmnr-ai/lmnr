import { getClusterColorById } from "@/lib/clusters/colors";
import { type EvalRow } from "@/lib/evaluation/types";

export interface IssueCluster {
  id: string;
  title: string;
  description: string;
  color: string;
}

export interface AssignedIssueCluster extends IssueCluster {
  indices: number[];
}

/**
 * MOCK issue clusters (Round 6). Fixed copy, deterministic assignment by row
 * index — no LLM, no randomness. A real implementation clusters actual failure
 * descriptions; this exists to judge whether surfacing "recurring issues"
 * above the table is worth building.
 */
const CLUSTER_DEFS: Omit<IssueCluster, "color">[] = [
  {
    id: "tool-call-formatting",
    title: "Tool-call formatting errors",
    description:
      "The agent emits tool calls with malformed or missing required arguments before the executor can run them. This forces a retry or aborts the step entirely, inflating both latency and cost.",
  },
  {
    id: "hallucinated-values",
    title: "Hallucinated numeric values",
    description:
      "The agent states specific figures, dates, or IDs that don't appear anywhere in the provided context. Reviewers flag these as fabricated even when the surrounding reasoning looks plausible.",
  },
  {
    id: "missing-follow-up",
    title: "Missing follow-up question",
    description:
      "The agent proceeds with an ambiguous or underspecified request instead of asking a clarifying question. It commits to one interpretation and produces a confident but often wrong answer.",
  },
  {
    id: "ignored-constraint",
    title: "Ignored system constraint",
    description:
      "The agent violates an explicit instruction from the system prompt, such as a formatting rule or a scope limit. The violation is subtle enough that surface-level scoring can miss it.",
  },
  {
    id: "premature-give-up",
    title: "Premature give-up",
    description:
      "The agent abandons a multi-step task after a single failed attempt instead of trying an alternate approach. It returns an apology or a partial result rather than continuing to work the problem.",
  },
];

export const ISSUE_CLUSTERS: IssueCluster[] = CLUSTER_DEFS.map((c) => ({
  ...c,
  color: getClusterColorById(c.id),
}));

// Interleaved period-20 assignment (NOT contiguous ranges: a 25-row eval must
// still exercise all five clusters). Weights ≈25/20/10/10/5%, 30% unassigned.
// Pure function of index, no state.
const PATTERN: (string | null)[] = [
  "tool-call-formatting",
  "hallucinated-values",
  null,
  "missing-follow-up",
  "tool-call-formatting",
  null,
  "hallucinated-values",
  "ignored-constraint",
  "tool-call-formatting",
  null,
  "premature-give-up",
  "hallucinated-values",
  "tool-call-formatting",
  null,
  "missing-follow-up",
  "hallucinated-values",
  "tool-call-formatting",
  null,
  "ignored-constraint",
  null,
];

export function getClusterIdForIndex(index: number): string | null {
  return PATTERN[((index % PATTERN.length) + PATTERN.length) % PATTERN.length];
}

/**
 * Groups row indices by cluster, ranked by count descending. Client-side and
 * mock-only — a real impl would compute membership server-side.
 */
export function assignMockClusters(rows: EvalRow[]): AssignedIssueCluster[] {
  const indicesByCluster = new Map<string, number[]>();
  for (const row of rows) {
    const index = row["index"] as number | undefined;
    if (index === undefined) continue;
    const clusterId = getClusterIdForIndex(index);
    if (!clusterId) continue;
    indicesByCluster.set(clusterId, [...(indicesByCluster.get(clusterId) ?? []), index]);
  }
  return ISSUE_CLUSTERS.map((cluster) => ({ ...cluster, indices: indicesByCluster.get(cluster.id) ?? [] }))
    .filter((cluster) => cluster.indices.length > 0)
    .sort((a, b) => b.indices.length - a.indices.length);
}
