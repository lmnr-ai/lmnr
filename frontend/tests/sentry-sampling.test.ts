import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type * as Sentry from "@sentry/nextjs";

import {
  DEFAULT_MIN_SAMPLED_DURATION_SECS,
  DEFAULT_SAMPLE_RATE,
  durationSecs,
  hasError,
  resolveSamplingConfig,
  shouldSendTransaction,
} from "@/lib/sentry/sampling";

// Pins the LAM-2070 heuristic: errors and slow transactions must never be
// subject to chance; everything else rides the sample rate.

const CONFIG = { sampleRate: 0.5, minDurationSecs: 5 };

/** A transaction lasting `secs`, with no statuses set anywhere. */
const transaction = (secs: number): Sentry.Event => ({
  type: "transaction",
  start_timestamp: 1_000,
  timestamp: 1_000 + secs,
});

const withRootStatus = (event: Sentry.Event, status: string): Sentry.Event => ({
  ...event,
  contexts: { trace: { span_id: "a", trace_id: "b", status } },
});

const withSpanStatus = (event: Sentry.Event, status: string): Sentry.Event => ({
  ...event,
  spans: [{ span_id: "a", trace_id: "b", start_timestamp: 1_000, data: {}, status }],
});

// `never` asserts the decision was made without consulting chance at all.
const never = () => {
  throw new Error("random() must not be called for errors or slow transactions");
};

describe("shouldSendTransaction", () => {
  it("keeps error transactions without consulting the sample rate", () => {
    const event = withRootStatus(transaction(0.1), "internal_error");
    assert.equal(shouldSendTransaction(event, { ...CONFIG, sampleRate: 0 }, never), true);
  });

  it("keeps a transaction whose child span errored", () => {
    const event = withSpanStatus(transaction(0.1), "not_found");
    assert.equal(shouldSendTransaction(event, { ...CONFIG, sampleRate: 0 }, never), true);
  });

  it("keeps slow transactions without consulting the sample rate", () => {
    assert.equal(shouldSendTransaction(transaction(5), { ...CONFIG, sampleRate: 0 }, never), true);
    assert.equal(shouldSendTransaction(transaction(30), { ...CONFIG, sampleRate: 0 }, never), true);
  });

  it("drops fast successful transactions at a zero sample rate", () => {
    assert.equal(
      shouldSendTransaction(transaction(0.1), { ...CONFIG, sampleRate: 0 }, () => 0.99),
      false
    );
    // Just under the threshold is still "fast".
    assert.equal(
      shouldSendTransaction(transaction(4.999), { ...CONFIG, sampleRate: 0 }, () => 0),
      false
    );
  });

  it("keeps everything at a full sample rate", () => {
    assert.equal(
      shouldSendTransaction(transaction(0.001), { ...CONFIG, sampleRate: 1 }, () => 0.99),
      true
    );
  });

  it("applies the sample rate as a strict lower bound", () => {
    // random() < rate, so a draw exactly at the rate is dropped.
    assert.equal(
      shouldSendTransaction(transaction(0.1), CONFIG, () => 0.5),
      false
    );
    assert.equal(
      shouldSendTransaction(transaction(0.1), CONFIG, () => 0.499),
      true
    );
  });

  it("treats an explicit ok status as success", () => {
    // The SDK sets "ok" on healthy spans; that must not bypass sampling.
    const event = withRootStatus(transaction(0.1), "ok");
    assert.equal(hasError(event), false);
    assert.equal(
      shouldSendTransaction(event, { ...CONFIG, sampleRate: 0 }, () => 0),
      false
    );
  });

  it("treats a missing status as success", () => {
    assert.equal(hasError(transaction(0.1)), false);
  });

  it("samples an unfinished transaction rather than assuming it is slow", () => {
    const event: Sentry.Event = { type: "transaction", start_timestamp: 1_000 };
    assert.equal(durationSecs(event), undefined);
    assert.equal(
      shouldSendTransaction(event, { ...CONFIG, sampleRate: 0 }, () => 0),
      false
    );
  });

  it("keeps everything when the duration threshold is zero", () => {
    assert.equal(shouldSendTransaction(transaction(0), { sampleRate: 0, minDurationSecs: 0 }, never), true);
  });
});

describe("resolveSamplingConfig", () => {
  it("falls back to defaults for unset, empty, and unparseable values", () => {
    for (const env of [{}, { sampleRate: "", minDurationSecs: "  " }, { sampleRate: "abc" }]) {
      const config = resolveSamplingConfig(env);
      assert.equal(config.sampleRate, DEFAULT_SAMPLE_RATE);
      assert.equal(config.minDurationSecs, DEFAULT_MIN_SAMPLED_DURATION_SECS);
    }
  });

  it("parses valid values", () => {
    const config = resolveSamplingConfig({ sampleRate: "0.2", minDurationSecs: "10" });
    assert.deepEqual(config, { sampleRate: 0.2, minDurationSecs: 10 });
  });

  it("accepts the decimal forms Rust's parse::<f64>() accepts", () => {
    // Keeps the two stacks reading the same env value identically.
    assert.equal(resolveSamplingConfig({ sampleRate: ".5" }).sampleRate, 0.5);
    assert.equal(resolveSamplingConfig({ sampleRate: "1." }).sampleRate, 1);
    assert.equal(resolveSamplingConfig({ sampleRate: "+0.5" }).sampleRate, 0.5);
    assert.equal(resolveSamplingConfig({ sampleRate: "1e-2" }).sampleRate, 0.01);
    assert.equal(resolveSamplingConfig({ minDurationSecs: "  7  " }).minDurationSecs, 7);
  });

  it("rejects malformed values with a valid numeric prefix", () => {
    // Number.parseFloat would return the prefix (0.2 / 50) and Number would read
    // "0x10" as 16, silently applying a rate app-server would have defaulted on.
    for (const sampleRate of ["0.2x", "50%", "0x10", "1abc", "0.2 0.3", "--1", "1e", "Infinity"]) {
      assert.equal(
        resolveSamplingConfig({ sampleRate }).sampleRate,
        DEFAULT_SAMPLE_RATE,
        `expected ${sampleRate} to fall back`
      );
    }
    assert.equal(resolveSamplingConfig({ minDurationSecs: "5s" }).minDurationSecs, DEFAULT_MIN_SAMPLED_DURATION_SECS);
  });

  it("clamps out-of-range values instead of disabling sampling", () => {
    assert.equal(resolveSamplingConfig({ sampleRate: "5" }).sampleRate, 1);
    assert.equal(resolveSamplingConfig({ sampleRate: "-1" }).sampleRate, 0);
    assert.equal(resolveSamplingConfig({ minDurationSecs: "-3" }).minDurationSecs, 0);
  });

  it("accepts caller-supplied defaults so the client can differ from the server", () => {
    const config = resolveSamplingConfig({}, { sampleRate: 0.2, minDurationSecs: 5 });
    assert.deepEqual(config, { sampleRate: 0.2, minDurationSecs: 5 });
  });
});
