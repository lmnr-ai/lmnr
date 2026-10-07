// Measured median flow-1 cost per analyzed trace using the 4K-output
// configuration. Each lower bound starts the corresponding trace-size bucket.
const SIGNAL_COST_PER_TRACE_USD: ReadonlyArray<readonly [number, number]> = [
  [0, 0.0004],
  [5_000, 0.0007],
  [10_000, 0.001],
  [25_000, 0.0012],
  [50_000, 0.002],
  [100_000, 0.0035],
  [250_000, 0.0051],
  [500_000, 0.0053],
  [1_000_000, 0.0055],
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
