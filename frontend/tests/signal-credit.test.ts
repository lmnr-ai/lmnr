import assert from "node:assert/strict";
import test from "node:test";

import { calculateBillableSignalCostMicroUsd, calculateSignalCreditState } from "../lib/actions/usage/signal-credit";

const CREDIT = 5_000_000;

test("shows no credit for workspaces created before the grant", () => {
  assert.deepEqual(
    calculateSignalCreditState({
      persistedRemainingMicroUsd: null,
      pendingUncreditedCostMicroUsd: 1_000_000,
      creditedCostThisPeriodMicroUsd: 0,
    }),
    { grantedMicroUsd: 0, remainingMicroUsd: 0, appliedThisPeriodMicroUsd: 0 }
  );
});

test("subtracts pending unclassified runs from the displayed balance", () => {
  assert.deepEqual(
    calculateSignalCreditState({
      persistedRemainingMicroUsd: CREDIT,
      pendingUncreditedCostMicroUsd: 1_250_000,
      creditedCostThisPeriodMicroUsd: 0,
    }),
    {
      grantedMicroUsd: CREDIT,
      remainingMicroUsd: 3_750_000,
      appliedThisPeriodMicroUsd: 0,
    }
  );
});

test("never displays a negative remaining balance", () => {
  assert.equal(
    calculateSignalCreditState({
      persistedRemainingMicroUsd: 100_000,
      pendingUncreditedCostMicroUsd: 200_000,
      creditedCostThisPeriodMicroUsd: 4_000_000,
    }).remainingMicroUsd,
    0
  );
});

test("reports credited runs separately from remaining credit", () => {
  assert.deepEqual(
    calculateSignalCreditState({
      persistedRemainingMicroUsd: 2_000_000,
      pendingUncreditedCostMicroUsd: 0,
      creditedCostThisPeriodMicroUsd: 3_000_000,
    }),
    {
      grantedMicroUsd: CREDIT,
      remainingMicroUsd: 2_000_000,
      appliedThisPeriodMicroUsd: 3_000_000,
    }
  );
});

test("subtracts only credited runs from billable usage", () => {
  assert.equal(calculateBillableSignalCostMicroUsd(7_000_000, 5_000_000), 2_000_000);
});
