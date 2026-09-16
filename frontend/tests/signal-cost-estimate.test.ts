import assert from "node:assert/strict";
import test from "node:test";

import { estimateSignalCostUsd, signalTokenEstimate } from "../components/landing/pricing/signal-cost-estimate";

test("uses smooth-curve samples at each lower-bound slider step", () => {
  assert.deepEqual(signalTokenEstimate(1_000), { input: 10_478, cacheRead: 7_987, output: 1_142 });
  assert.deepEqual(signalTokenEstimate(2_500), { input: 10_890, cacheRead: 7_987, output: 1_445 });
  assert.deepEqual(signalTokenEstimate(4_999), { input: 10_890, cacheRead: 7_987, output: 1_445 });
  assert.deepEqual(signalTokenEstimate(5_000), { input: 11_435, cacheRead: 7_987, output: 1_728 });
});

test("uses the 1M bucket for 1M and larger traces", () => {
  const expected = { input: 68_804, cacheRead: 38_752, output: 6_760 };
  assert.deepEqual(signalTokenEstimate(1_000_000), expected);
  assert.deepEqual(signalTokenEstimate(2_500_000), expected);
});

test("prices landing estimates with unified rates and cached prompt adjustment", () => {
  // At 1M: fresh input = 68,804 - 4,000 - 38,752 = 26,052.
  const expectedPerRun = (26_052 * 0.04 + 38_752 * 0.004 + 6_760 * 0.24) / 1_000_000;
  assert.ok(Math.abs(estimateSignalCostUsd(1_000, 1_000_000, 50) - expectedPerRun * 500) < 1e-12);
});
