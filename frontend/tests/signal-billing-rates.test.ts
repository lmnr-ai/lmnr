import assert from "node:assert/strict";
import test from "node:test";

import { formatSignalsOverage, formatSignalsOverageShort, signalTokenCostMicroUsd } from "../lib/billing/tiers";

test("uses unified signal rates for standard and Pro metering", () => {
  // 1M prompt tokens includes 200K cached tokens, so only 800K is fresh.
  const expectedMicroUsd = Math.round(800_000 * 0.05 + 200_000 * 0.005 + 100_000 * 0.3);
  assert.equal(signalTokenCostMicroUsd(1_000_000, 200_000, 100_000, "hobby"), expectedMicroUsd);
  assert.equal(signalTokenCostMicroUsd(1_000_000, 200_000, 100_000, "pro"), expectedMicroUsd);
});

test("shows input, cached-input, and output overage rates", () => {
  assert.equal(
    formatSignalsOverage("pro"),
    "$0.05 / 1M input tokens, $0.005 / 1M cached input tokens, $0.3 / 1M output tokens"
  );
  assert.equal(formatSignalsOverageShort("pro"), "$0.05 / $0.005 cached / $0.3 per 1M tok");
});
