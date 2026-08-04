import type * as Sentry from "@sentry/nextjs";

/**
 * Duration- and status-aware sampling of Sentry transactions.
 *
 * Sentry bills by span volume, but we use it for error and latency tracking. So
 * the transactions worth paying for are the ones that FAILED or were SLOW; the
 * bulk of the bill is fast, successful traffic nobody looks at.
 *
 * Decision per transaction:
 *   1. the transaction or any of its spans has an error status -> keep
 *   2. duration >= SENTRY_MIN_SAMPLED_DURATION_SECS               -> keep
 *   3. otherwise keep with probability EXTERNAL_TRACING_SAMPLE_RATE
 *
 * This runs in `beforeSendTransaction` rather than `tracesSampler` because a
 * sampler runs at transaction START, where neither the final duration nor the
 * status is known yet — it could only ever implement rule 3.
 *
 * Whole transactions are sampled, never individual spans: dropping a subset of a
 * transaction's spans would leave orphaned children and broken timings in the
 * Sentry UI.
 */

export const DEFAULT_SAMPLE_RATE = 0.5;
export const DEFAULT_MIN_SAMPLED_DURATION_SECS = 5;

/**
 * A plain decimal number, optionally signed and/or in exponent form.
 *
 * Required because `Number.parseFloat` stops at the first invalid character and
 * returns the numeric PREFIX (`"0.2x"` -> `0.2`, `"50%"` -> `50`), while
 * `Number` accepts hex (`"0x10"` -> `16`). Rust's `parse::<f64>()` rejects all
 * three, so without this gate a typo'd value would silently take effect on the
 * frontend while app-server fell back to its default.
 */
const DECIMAL_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/** Parses a float, falling back to `fallback` for unset/empty/malformed/non-finite input. */
const parseFloatEnv = (raw: string | undefined, fallback: number): number => {
  const trimmed = (raw ?? "").trim();
  if (!DECIMAL_NUMBER.test(trimmed)) {
    return fallback;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export interface SamplingConfig {
  /** Keep-fraction for fast, non-error transactions. */
  sampleRate: number;
  /** Duration (seconds) at or above which a transaction always survives. */
  minDurationSecs: number;
}

/**
 * Resolves thresholds from env, clamping both into a sane range.
 *
 * These are read at `Sentry.init` time — module-scope reads would be inlined at
 * build time on the client, where only NEXT_PUBLIC_* vars exist anyway, so the
 * client passes its values explicitly instead of relying on env.
 */
export const resolveSamplingConfig = (
  env: { sampleRate?: string; minDurationSecs?: string } = {},
  defaults: SamplingConfig = {
    sampleRate: DEFAULT_SAMPLE_RATE,
    minDurationSecs: DEFAULT_MIN_SAMPLED_DURATION_SECS,
  }
): SamplingConfig => ({
  sampleRate: clamp(parseFloatEnv(env.sampleRate, defaults.sampleRate), 0, 1),
  minDurationSecs: Math.max(parseFloatEnv(env.minDurationSecs, defaults.minDurationSecs), 0),
});

/**
 * A status is only an error when explicitly set to something other than "ok".
 * An unset status means the SDK never marked the span, which is not a failure.
 */
const isErrorStatus = (status: string | undefined): boolean => !!status && status !== "ok";

/** True when the transaction itself or any of its spans carries an error status. */
export const hasError = (event: Sentry.Event): boolean =>
  isErrorStatus(event.contexts?.trace?.status) || !!event.spans?.some((span) => isErrorStatus(span.status));

/**
 * Wall-clock duration in seconds, or undefined for an event missing either
 * timestamp (an unfinished transaction) or with non-monotonic timestamps.
 */
export const durationSecs = (event: Sentry.Event): number | undefined => {
  const { timestamp, start_timestamp: startTimestamp } = event;
  if (typeof timestamp !== "number" || typeof startTimestamp !== "number") {
    return undefined;
  }
  const duration = timestamp - startTimestamp;
  return duration >= 0 ? duration : undefined;
};

/**
 * Whether a completed transaction should reach Sentry.
 *
 * `random` is injectable so the decision is testable; errors and slow
 * transactions never consult it, so chance can't drop an interesting trace.
 */
export const shouldSendTransaction = (
  event: Sentry.Event,
  { sampleRate, minDurationSecs }: SamplingConfig,
  random: () => number = Math.random
): boolean => {
  if (hasError(event)) {
    return true;
  }

  const duration = durationSecs(event);
  if (duration !== undefined && duration >= minDurationSecs) {
    return true;
  }

  return random() < sampleRate;
};
