import { dataPreview, isScoreValue } from "@/components/evaluation/poc/sidebar-row";
import { type EvalRow } from "@/lib/evaluation/types";

export interface MockPattern {
  id: string;
  title: string;
  summary: string;
  rows: EvalRow[];
}

/**
 * MOCK insight generator (V5). Fabricated pattern COPY over REAL datapoints:
 * chips must select real rows or the POC tests nothing about the improvement
 * loop. Deterministic (no randomness) so the card is stable across renders.
 * A real implementation would batch an LLM over the bottom-K datapoints —
 * deferred on economics; this exists to judge whether the product shape earns
 * that spend.
 */
export function generateMockInsights(rows: EvalRow[], primaryScore?: string): MockPattern[] {
  if (!rows.length || !primaryScore) return [];
  const pool = rows.slice(0, 12);
  const patterns: MockPattern[] = [];

  const missing = pool.filter((r) => !isScoreValue(r[`score:${primaryScore}`]));
  if (missing.length >= 2) {
    patterns.push({
      id: "executor-failures",
      title: "Executor failures before scoring",
      summary: `${missing.length} datapoints have no ${primaryScore} at all — the executor threw before the evaluator ran. These fail identically on a malformed tool response, not on model quality.`,
      rows: missing.slice(0, 4),
    });
  }

  const scored = pool.filter((r) => isScoreValue(r[`score:${primaryScore}`]));
  if (scored.length >= 3) {
    patterns.push({
      id: "tool-loops",
      title: "Repeated tool-call loops",
      summary: `${Math.min(scored.length, 4)} of the lowest-${primaryScore} datapoints show the agent retrying the same tool with near-identical arguments 3+ times before giving up.`,
      rows: scored.slice(0, 4),
    });
  }

  const long = scored.filter((r) => dataPreview(r["data"]).length > 400);
  if (long.length >= 2) {
    patterns.push({
      id: "long-context",
      title: "Long-input degradation",
      summary: `Scores drop sharply on oversized inputs: ${long.length} of the worst rows carry inputs well above the run median. Consider truncation or retrieval instead of full-context stuffing.`,
      rows: long.slice(0, 4),
    });
  }

  return patterns.slice(0, 3);
}
