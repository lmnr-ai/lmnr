// Single source of truth for evaluation score aggregation over the raw
// per-datapoint values. Used by BOTH the single-eval stat shields
// (lib/actions/evaluation/utils.ts) and the group progression chart
// (lib/clickhouse/evaluation-scores.ts) so the two surfaces never disagree.

export type ScoreAggregation = "avg" | "sum" | "min" | "max" | "median" | "p90" | "p95" | "p99";

const QUANTILE_FOR: Record<"median" | "p90" | "p95" | "p99", number> = {
  median: 0.5,
  p90: 0.9,
  p95: 0.95,
  p99: 0.99,
};

// Linear-interpolation quantile (numpy 'linear' / Excel PERCENTILE.INC), q in [0, 1].
// `sorted` MUST be ascending and non-empty. median (q=0.5) collapses to the
// average of the two middle values for even-length inputs.
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Exact aggregates over the raw values. Returns null for an empty input.
export function computeScoreAggregates(values: number[]): Record<ScoreAggregation, number> | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, v) => acc + v, 0);
  return {
    avg: sum / values.length,
    sum,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: quantile(sorted, QUANTILE_FOR.median),
    p90: quantile(sorted, QUANTILE_FOR.p90),
    p95: quantile(sorted, QUANTILE_FOR.p95),
    p99: quantile(sorted, QUANTILE_FOR.p99),
  };
}

// Single-aggregation convenience (the group progression picks one fn per run+score).
// avg/sum/min/max stay O(n) with no allocation; only quantiles pay the sort.
export function aggregateScore(values: number[], fn: ScoreAggregation): number | undefined {
  if (values.length === 0) return undefined;
  switch (fn) {
    case "avg":
    case "sum": {
      let sum = 0;
      for (const v of values) sum += v;
      return fn === "avg" ? sum / values.length : sum;
    }
    case "min": {
      let m = values[0];
      for (const v of values) if (v < m) m = v;
      return m;
    }
    case "max": {
      let m = values[0];
      for (const v of values) if (v > m) m = v;
      return m;
    }
    default: {
      // median / p90 / p95 / p99 need order.
      const sorted = [...values].sort((a, b) => a - b);
      return quantile(sorted, QUANTILE_FOR[fn]);
    }
  }
}
