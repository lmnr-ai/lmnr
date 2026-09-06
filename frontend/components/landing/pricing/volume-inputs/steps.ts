// Monthly token volume is asked for as TWO factors, not one total: nobody knows
// their token count offhand, but everyone knows roughly how many runs they do
// and how big one is. ./index lays them out as the multiplication they are.
export const RUN_STEPS = [
  100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000,
  5_000_000, 10_000_000,
];

export const TOKENS_PER_RUN_STEPS = [
  1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000,
];

// 1,000 runs of 100K tokens = 100M tokens/mo, a small production agent.
export const DEFAULT_RUNS_IDX = 3;
export const DEFAULT_TOKENS_PER_RUN_IDX = 6;

// Share of runs a Signal analyzes, as a percentage. Most teams run Signals on a
// filtered slice of their traffic, not all of it. Even steps rather than the
// old 1/5/10/25/50/75/100 ramp: an uneven scale makes the same drag mean a
// different thing at each end of the track, which reads as the slider lying.
export const COVERAGE_STEPS = Array.from({ length: 21 }, (_, i) => i * 5);

/** Indices into the scales above, not the values themselves — the scales are
 *  buckets, and the slider's position IS the state. */
export interface VolumeProps {
  runsIdx: number;
  tokensPerRunIdx: number;
  coverageIdx: number;
  onRunsIdx: (i: number) => void;
  onTokensPerRunIdx: (i: number) => void;
  onCoverageIdx: (i: number) => void;
}

const TOKEN_UNITS = [
  { limit: 1_000_000_000_000, suffix: "T" },
  { limit: 1_000_000_000, suffix: "B" },
  { limit: 1_000_000, suffix: "M" },
  { limit: 1_000, suffix: "K" },
];

/** Needs the K step, since per-run token counts are in the thousands — a
 *  millions-only floor renders 100,000 as "0M". One decimal only when it
 *  changes the number, so 2.5M but 3M rather than 3.0M. */
export function formatTokens(tokens: number): string {
  const unit = TOKEN_UNITS.find((u) => tokens >= u.limit);
  if (!unit) return String(tokens);
  const n = tokens / unit.limit;
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}${unit.suffix}`;
}
