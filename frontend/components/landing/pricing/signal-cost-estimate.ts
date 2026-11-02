// Flow-1 cost per analyzed trace, set 30% below the measured median with the
// 4K-output configuration. Each lower bound starts the corresponding trace-size bucket.
const SIGNAL_COST_PER_TRACE_USD: ReadonlyArray<readonly [number, number]> = [
  [0, 0.00028],
  [5_000, 0.00049],
  [10_000, 0.0007],
  [25_000, 0.00084],
  [50_000, 0.0014],
  [100_000, 0.00245],
  [250_000, 0.00357],
  [500_000, 0.00371],
  [1_000_000, 0.00385],
];

export function signalCostPerTraceUsd(tokensPerRun: number): number {
  let cost = SIGNAL_COST_PER_TRACE_USD[0][1];
  for (const [lowerBound, candidate] of SIGNAL_COST_PER_TRACE_USD) {
    if (tokensPerRun < lowerBound) break;
    cost = candidate;
  }
  return cost;
}

export function estimateSignalCostUsd(runs: number, tokensPerRun: number, signalCoveragePct: number): number {
  const analyzedRuns = runs * (signalCoveragePct / 100);
  return analyzedRuns * signalCostPerTraceUsd(tokensPerRun);
}
