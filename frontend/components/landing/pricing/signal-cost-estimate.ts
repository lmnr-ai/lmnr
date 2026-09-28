// Landing-calculator estimates only. These rates intentionally do not feed
// billing metering; update them when the public estimate or measured data changes.
const ESTIMATE_INPUT_RATE_PER_MILLION = 0.05;
const ESTIMATE_CACHE_READ_RATE_PER_MILLION = 0.01;
const ESTIMATE_OUTPUT_RATE_PER_MILLION = 0.35;

interface SignalTokenEstimate {
  input: number;
  cacheRead: number;
  output: number;
}

// Measured median Flow-1 token usage at each calculator trace-size step.
// The 1K and 2.5K steps use the measured <5K medians.
const SIGNAL_TOKEN_ESTIMATES: ReadonlyArray<readonly [number, SignalTokenEstimate]> = [
  [1_000, { input: 14_500, cacheRead: 11_000, output: 700 }],
  [2_500, { input: 14_500, cacheRead: 11_000, output: 700 }],
  [5_000, { input: 14_500, cacheRead: 11_000, output: 700 }],
  [10_000, { input: 12_700, cacheRead: 6_300, output: 1_000 }],
  [25_000, { input: 14_300, cacheRead: 7_600, output: 1_200 }],
  [50_000, { input: 14_600, cacheRead: 7_400, output: 1_500 }],
  [100_000, { input: 19_100, cacheRead: 10_800, output: 1_900 }],
  [250_000, { input: 41_700, cacheRead: 30_300, output: 2_800 }],
  [500_000, { input: 77_300, cacheRead: 63_400, output: 4_800 }],
  [1_000_000, { input: 91_900, cacheRead: 76_200, output: 6_100 }],
];

export function signalTokenEstimate(tokensPerRun: number): SignalTokenEstimate {
  let estimate = SIGNAL_TOKEN_ESTIMATES[0][1];
  for (const [lowerBound, candidate] of SIGNAL_TOKEN_ESTIMATES) {
    if (tokensPerRun < lowerBound) break;
    estimate = candidate;
  }
  return estimate;
}

export function estimateSignalCostUsd(runs: number, tokensPerRun: number, signalCoveragePct: number): number {
  const analyzedRuns = runs * (signalCoveragePct / 100);
  const estimate = signalTokenEstimate(tokensPerRun);

  // Cached input is included in the total input count, so charge the remainder
  // at the regular input rate and the cached portion at its discounted rate.
  const billableInputPerRun = Math.max(0, estimate.input - estimate.cacheRead);
  const costPerRun =
    (billableInputPerRun / 1_000_000) * ESTIMATE_INPUT_RATE_PER_MILLION +
    (estimate.cacheRead / 1_000_000) * ESTIMATE_CACHE_READ_RATE_PER_MILLION +
    (estimate.output / 1_000_000) * ESTIMATE_OUTPUT_RATE_PER_MILLION;

  return analyzedRuns * costPerRun;
}
