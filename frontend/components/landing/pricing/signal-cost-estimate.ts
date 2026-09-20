// Landing-calculator estimates only. These rates intentionally do not feed
// billing metering; update them when the public estimate or measured data changes.
const ESTIMATE_INPUT_RATE_PER_MILLION = 0.05;
const ESTIMATE_CACHE_READ_RATE_PER_MILLION = 0.005;
const ESTIMATE_OUTPUT_RATE_PER_MILLION = 0.3;
const CACHED_SYSTEM_PROMPT_TOKENS = 4_000;

interface SignalTokenEstimate {
  input: number;
  cacheRead: number;
  output: number;
}

// Samples from smooth monotonic power fits over the measured medians. Each fit
// has the form y = c + a * (agentTokens / 1_000)^b:
//   input: c=10023.374381537, a=454.748834857871, b=0.70382135531258
//   cache: c=7987.25563666709, a=0.00003076433850373, b=3
//   output: c=0.000000004272271, a=1141.59455626961, b=0.25748504619831
// Values are rounded to whole tokens after sampling at the calculator's steps.
// The 1K values are a small extrapolation below the measured 2.5K lower bound.
const SIGNAL_TOKEN_ESTIMATES: ReadonlyArray<readonly [number, SignalTokenEstimate]> = [
  [1_000, { input: 10_478, cacheRead: 7_987, output: 1_142 }],
  [2_500, { input: 10_890, cacheRead: 7_987, output: 1_445 }],
  [5_000, { input: 11_435, cacheRead: 7_987, output: 1_728 }],
  [10_000, { input: 12_323, cacheRead: 7_987, output: 2_065 }],
  [25_000, { input: 14_405, cacheRead: 7_988, output: 2_615 }],
  [50_000, { input: 17_161, cacheRead: 7_991, output: 3_126 }],
  [100_000, { input: 21_649, cacheRead: 8_018, output: 3_737 }],
  [250_000, { input: 32_179, cacheRead: 8_468, output: 4_731 }],
  [500_000, { input: 46_111, cacheRead: 11_833, output: 5_655 }],
  [1_000_000, { input: 68_804, cacheRead: 38_752, output: 6_760 }],
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

  // The system prompt is expected to be cached. Remove it from ordinary input
  // without adding it to cache reads, per the assumptions behind this estimate.
  const inputAfterSystemPrompt = Math.max(0, estimate.input - CACHED_SYSTEM_PROMPT_TOKENS);
  // Cache reads are normally a subset of input. Keep the measured cache count
  // unchanged while removing the 4K system prompt, then charge only the
  // remaining non-cached input at the full input rate.
  const billableInputPerRun = Math.max(0, inputAfterSystemPrompt - estimate.cacheRead);
  const costPerRun =
    (billableInputPerRun / 1_000_000) * ESTIMATE_INPUT_RATE_PER_MILLION +
    (estimate.cacheRead / 1_000_000) * ESTIMATE_CACHE_READ_RATE_PER_MILLION +
    (estimate.output / 1_000_000) * ESTIMATE_OUTPUT_RATE_PER_MILLION;

  return analyzedRuns * costPerRun;
}
