import assert from "node:assert/strict";
import test from "node:test";

import { estimateSignalCostUsd, signalTokenEstimate } from "../components/landing/pricing/signal-cost-estimate";

test("uses measured medians at each lower-bound slider step", () => {
  const under5KMedian = { input: 14_500, cacheRead: 11_000, output: 700 };
  assert.deepEqual(signalTokenEstimate(1_000), under5KMedian);
  assert.deepEqual(signalTokenEstimate(2_500), under5KMedian);
  assert.deepEqual(signalTokenEstimate(4_999), under5KMedian);
  assert.deepEqual(signalTokenEstimate(5_000), under5KMedian);
  assert.deepEqual(signalTokenEstimate(10_000), { input: 12_700, cacheRead: 6_300, output: 1_000 });
});

test("uses the 1M bucket for 1M and larger traces", () => {
  const expected = { input: 91_900, cacheRead: 76_200, output: 6_100 };
  assert.deepEqual(signalTokenEstimate(1_000_000), expected);
  assert.deepEqual(signalTokenEstimate(2_500_000), expected);
});

test("prices measured input, cached-input, and output usage", () => {
  // At 1M: fresh input = 91,900 total input - 76,200 cached input.
  const expectedPerRun = (15_700 * 0.05 + 76_200 * 0.01 + 6_100 * 0.35) / 1_000_000;
  assert.ok(Math.abs(estimateSignalCostUsd(1_000, 1_000_000, 50) - expectedPerRun * 500) < 1e-12);
});
