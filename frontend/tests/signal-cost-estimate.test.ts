import assert from "node:assert/strict";
import test from "node:test";

import { estimateSignalCostUsd, signalCostPerTraceUsd } from "../components/landing/pricing/signal-cost-estimate";

test("uses measured flow-1 4K-output costs at each trace-size boundary", () => {
  assert.equal(signalCostPerTraceUsd(1_000), 0.0004);
  assert.equal(signalCostPerTraceUsd(2_500), 0.0004);
  assert.equal(signalCostPerTraceUsd(4_999), 0.0004);
  assert.equal(signalCostPerTraceUsd(5_000), 0.0007);
  assert.equal(signalCostPerTraceUsd(10_000), 0.001);
  assert.equal(signalCostPerTraceUsd(25_000), 0.0012);
  assert.equal(signalCostPerTraceUsd(50_000), 0.002);
  assert.equal(signalCostPerTraceUsd(100_000), 0.0035);
  assert.equal(signalCostPerTraceUsd(250_000), 0.0051);
  assert.equal(signalCostPerTraceUsd(500_000), 0.0053);
});

test("uses the 1M bucket for 1M and larger traces", () => {
  assert.equal(signalCostPerTraceUsd(1_000_000), 0.0055);
  assert.equal(signalCostPerTraceUsd(2_500_000), 0.0055);
});

test("prices analyzed runs directly from the measured per-trace cost", () => {
  assert.equal(estimateSignalCostUsd(1_000, 100_000, 50), 1.75);
});
