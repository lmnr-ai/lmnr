import assert from "node:assert/strict";
import test from "node:test";

import { TIER_CONFIG } from "../lib/actions/checkout/types";
import {
  formatSignalsOverage,
  formatSignalsOverageShort,
  SIGNALS_SIGNUP_CREDIT_MICRO_USD,
  SIGNALS_SIGNUP_CREDIT_USD,
  signalTokenCostMicroUsd,
  TIERS,
} from "../lib/billing/tiers";

test("uses one $5 sign-up credit instead of recurring tier allowances", () => {
  assert.equal(SIGNALS_SIGNUP_CREDIT_USD, 5);
  assert.equal(SIGNALS_SIGNUP_CREDIT_MICRO_USD, 5_000_000);
  assert.equal(TIERS.free.includedSignalCostUsd, 0);
  assert.equal(TIERS.hobby.includedSignalCostUsd, 0);
  assert.equal(TIERS.pro.includedSignalCostUsd, 0);
  assert.equal(TIER_CONFIG.hobby.includedSignalCostMicroUsd, 0);
  assert.equal(TIER_CONFIG.pro.includedSignalCostMicroUsd, 0);
});

test("uses unified signal rates", () => {
  // 1M prompt tokens includes 200K cached tokens, so only 800K is fresh.
  const expectedMicroUsd = Math.round(800_000 * 0.05 + 200_000 * 0.01 + 100_000 * 0.3);
  assert.equal(signalTokenCostMicroUsd(1_000_000, 200_000, 100_000), expectedMicroUsd);
});

test("shows input, cached-input, and output overage rates", () => {
  assert.equal(
    formatSignalsOverage("pro"),
    "$0.05 / 1M input tokens, $0.01 / 1M cached input tokens, $0.30 / 1M output tokens"
  );
  assert.equal(formatSignalsOverageShort("pro"), "$0.05 / input Mtok\n$0.01 / cached Mtok\n$0.30 / output Mtok");
});
