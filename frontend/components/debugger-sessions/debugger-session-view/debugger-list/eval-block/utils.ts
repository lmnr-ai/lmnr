import { type ProgressionPoint } from "@/components/evaluations/progression-chart/shared";
import { type ChartConfig } from "@/components/ui/chart";
import { type SessionEvaluationRef } from "@/lib/actions/debugger-sessions";
import { spacedPalette } from "@/lib/colors";

// The shared progression dataset every eval card in a session renders: one
// point per evaluation block (timeline order), the union of all score names,
// and a stable per-score color. Identical across cards — each card only differs
// in which run it highlights (its own).
export interface SessionEvalProgression {
  points: ProgressionPoint[];
  scores: string[];
  chartConfig: ChartConfig;
}

// Block `createdAt` arrives in Postgres form ("2026-07-03 14:27:42.062862+00")
// which the chart's `parseUtcTimestamp` mis-parses (its regex misses the `+00`
// offset and appends a second `Z`, yielding an Invalid Date that crashes the
// axis tick formatter). Normalize to a clean `Z`-suffixed ISO string it handles;
// fall back to the raw value if the runtime can't parse it.
const toIsoTimestamp = (s: string): string => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
};

export const buildSessionEvalProgression = (
  evals: { id: string; name: string; createdAt: string; scores: { name: string; averageValue: number }[] }[]
): SessionEvalProgression => {
  const scoreSet = new Set<string>();
  const points: ProgressionPoint[] = evals.map((e) => {
    const values: Record<string, number | null> = {};
    for (const score of e.scores) {
      values[score.name] = score.averageValue;
      scoreSet.add(score.name);
    }
    return { timestamp: toIsoTimestamp(e.createdAt), evaluationId: e.id, name: e.name, values };
  });
  // Sorted so a score's position — and therefore its color — doesn't shift when
  // blocks arrive in a different order or the block that introduced it is gone.
  const scores = [...scoreSet].sort();
  const colors = spacedPalette(scores.length);
  const chartConfig: ChartConfig = Object.fromEntries(scores.map((key, i) => [key, { color: colors[i], label: key }]));
  return { points, scores, chartConfig };
};

// A score with its change vs the same-named score on the previous eval, plus
// whether the score is NEW (its name hadn't appeared in any earlier eval card —
// only meaningful once there's a prior card to compare against).
export type ScoreWithDelta = { name: string; value: number; delta?: number; isNew?: boolean };

// Per-eval score deltas vs the previous eval, keyed by eval id so the
// interleaved timeline can look them up regardless of the eval's position among
// traces / text blocks. `evaluations` must already be in timeline order (the
// blocks are ordered by `created_at`).
export const computeScoreDeltas = (evaluations: SessionEvaluationRef[]): Map<string, ScoreWithDelta[]> => {
  const prev = new Map<string, number>();
  const out = new Map<string, ScoreWithDelta[]>();
  let hasPrevEval = false;
  for (const evaluation of evaluations) {
    const scores = evaluation.scores.map((score) => {
      const before = prev.get(score.name);
      return {
        name: score.name,
        value: score.averageValue,
        delta: before === undefined ? undefined : score.averageValue - before,
        // A brand-new score dimension — but not for the very first card, where
        // "new vs nothing" would just highlight everything.
        isNew: hasPrevEval && before === undefined,
      };
    });
    // Update the baseline after computing this row's deltas.
    for (const score of evaluation.scores) prev.set(score.name, score.averageValue);
    out.set(evaluation.id, scores);
    hasPrevEval = true;
  }
  return out;
};
