import assert from "node:assert/strict";
import test from "node:test";

import { TIER_CONFIG } from "../lib/actions/checkout/types";
import { formatSignalsOverage, formatSignalsOverageShort, signalTokenCostMicroUsd, TIERS } from "../lib/billing/tiers";

test("uses the configured included Signals credits", () => {
  assert.equal(TIERS.free.includedSignalCostUsd, 2.5);
  assert.equal(TIERS.hobby.includedSignalCostUsd, 7.5);
  assert.equal(TIERS.pro.includedSignalCostUsd, 25);
  assert.equal(TIER_CONFIG.hobby.includedSignalCostMicroUsd, 7_500_000);
  assert.equal(TIER_CONFIG.pro.includedSignalCostMicroUsd, 25_000_000);
});

test("uses unified signal rates", () => {
  // 1M prompt tokens includes 200K cached tokens, so only 800K is fresh.
  const expectedMicroUsd = Math.round(800_000 * 0.05 + 200_000 * 0.01 + 100_000 * 0.35);
  assert.equal(signalTokenCostMicroUsd(1_000_000, 200_000, 100_000), expectedMicroUsd);
});

test("shows input, cached-input, and output overage rates", () => {
  assert.equal(
    formatSignalsOverage("pro"),
    "$0.05 / 1M input tokens, $0.01 / 1M cached input tokens, $0.35 / 1M output tokens"
  );
  assert.equal(
    formatSignalsOverageShort("pro"),
    "$0.05 per 1M input tok\n$0.01 per 1M cached input tok\n$0.35 per 1M output tok"
  );
});
