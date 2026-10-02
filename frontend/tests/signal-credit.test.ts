import assert from "node:assert/strict";
import test from "node:test";

import { calculateBillableSignalCostMicroUsd, calculateSignalCreditState } from "../lib/actions/usage/signal-credit";

const CREDIT = 5_000_000;

test("shows no credit for workspaces created before the grant", () => {
  assert.deepEqual(
    calculateSignalCreditState({
      persistedRemainingMicroUsd: null,
      creditedCostThisPeriodMicroUsd: 0,
    }),
    { grantedMicroUsd: 0, remainingMicroUsd: 0, appliedThisPeriodMicroUsd: 0 }
  );
});

test("uses the durable per-run credit balance", () => {
  assert.deepEqual(
    calculateSignalCreditState({
      persistedRemainingMicroUsd: 3_750_000,
      creditedCostThisPeriodMicroUsd: 0,
    }),
    {
      grantedMicroUsd: CREDIT,
      remainingMicroUsd: 3_750_000,
      appliedThisPeriodMicroUsd: 0,
    }
  );
});

test("reports credited runs separately from remaining credit", () => {
  assert.deepEqual(
    calculateSignalCreditState({
      persistedRemainingMicroUsd: 2_000_000,
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
