import assert from "node:assert/strict";
import test from "node:test";

import { TIER_CONFIG } from "../lib/actions/checkout/types";
import {
  formatSignalsIncluded,
  formatSignalsOverage,
  formatSignalsOverageShort,
  signalTokenCostMicroUsd,
  TIERS,
} from "../lib/billing/tiers";
import { billableSignalCostMicroUsd } from "../lib/billing/usage-estimate";

test("only Scale includes Signals usage, $50 every billing period", () => {
  assert.equal(TIERS.free.includedSignalCostUsd, 0);
  assert.equal(TIERS.hobby.includedSignalCostUsd, 0);
  assert.equal(TIERS.pro.includedSignalCostUsd, 50);
  assert.equal(TIER_CONFIG.hobby.includedSignalCostMicroUsd, 0);
  assert.equal(TIER_CONFIG.pro.includedSignalCostMicroUsd, TIERS.pro.includedSignalCostUsd * 1_000_000);
  assert.equal(formatSignalsIncluded("hobby"), "None");
  assert.equal(formatSignalsIncluded("pro"), "$50 / mo");
});

test("bills Signals only past the monthly allowance", () => {
  assert.equal(billableSignalCostMicroUsd(30_000_000, 50_000_000), 0);
  assert.equal(billableSignalCostMicroUsd(72_500_000, 50_000_000), 22_500_000);
  assert.equal(billableSignalCostMicroUsd(1_200_000, 0), 1_200_000);
});

test("tier allowances match the published pricing", () => {
  assert.equal(TIER_CONFIG.hobby.includedBytes, TIERS.hobby.includedBytesGB * 1024 ** 3);
  assert.equal(TIER_CONFIG.pro.includedBytes, TIERS.pro.includedBytesGB * 1024 ** 3);
  assert.deepEqual(
    [TIERS.hobby.basePriceMonthly, TIERS.hobby.includedBytesGB, TIERS.hobby.dataOverageRatePerGB],
    [30, 3, 2]
  );
  assert.deepEqual(
    [TIERS.pro.basePriceMonthly, TIERS.pro.includedBytesGB, TIERS.pro.dataOverageRatePerGB],
    [250, 100, 1]
  );
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
