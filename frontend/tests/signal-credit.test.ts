import assert from "node:assert/strict";
import test from "node:test";

import { calculateBillableSignalCostMicroUsd, calculateSignalCreditState } from "../lib/actions/usage/signal-credit";

const CREDIT = 5_000_000;

test("applies a new workspace credit without exceeding current-period usage", () => {
  assert.deepEqual(
    calculateSignalCreditState({
      grantedMicroUsd: CREDIT,
      remainingMicroUsd: CREDIT,
      previouslyAppliedMicroUsd: 0,
      samePeriod: true,
      currentPeriodCostMicroUsd: 1_250_000,
    }),
    {
      grantedMicroUsd: CREDIT,
      remainingMicroUsd: 3_750_000,
      appliedThisPeriodMicroUsd: 1_250_000,
      availableThisPeriodMicroUsd: CREDIT,
      appliedDeltaMicroUsd: 1_250_000,
    }
  );
});

test("carries unused credit into the next billing period without replenishing it", () => {
  assert.deepEqual(
    calculateSignalCreditState({
      grantedMicroUsd: CREDIT,
      remainingMicroUsd: 3_750_000,
      previouslyAppliedMicroUsd: 1_250_000,
      samePeriod: false,
      currentPeriodCostMicroUsd: 500_000,
    }),
    {
      grantedMicroUsd: CREDIT,
      remainingMicroUsd: 3_250_000,
      appliedThisPeriodMicroUsd: 500_000,
      availableThisPeriodMicroUsd: 3_750_000,
      appliedDeltaMicroUsd: 500_000,
    }
  );
});

test("does not grant credit to pre-deployment workspaces", () => {
  assert.deepEqual(
    calculateSignalCreditState({
      grantedMicroUsd: 0,
      remainingMicroUsd: 0,
      previouslyAppliedMicroUsd: 0,
      samePeriod: false,
      currentPeriodCostMicroUsd: 500_000,
    }),
    {
      grantedMicroUsd: 0,
      remainingMicroUsd: 0,
      appliedThisPeriodMicroUsd: 0,
      availableThisPeriodMicroUsd: 0,
      appliedDeltaMicroUsd: 0,
    }
  );
});

test("subtracts only credit applied in the current period from billable usage", () => {
  assert.equal(calculateBillableSignalCostMicroUsd(8_000_000, 5_000_000), 3_000_000);
  assert.equal(calculateBillableSignalCostMicroUsd(3_000_000, 3_000_000), 0);
});

test("caps the lifetime credit and reports only newly applied credit", () => {
  assert.deepEqual(
    calculateSignalCreditState({
      grantedMicroUsd: CREDIT,
      remainingMicroUsd: 2_000_000,
      previouslyAppliedMicroUsd: 3_000_000,
      samePeriod: true,
      currentPeriodCostMicroUsd: 8_000_000,
    }),
    {
      grantedMicroUsd: CREDIT,
      remainingMicroUsd: 0,
      appliedThisPeriodMicroUsd: CREDIT,
      availableThisPeriodMicroUsd: CREDIT,
      appliedDeltaMicroUsd: 2_000_000,
    }
  );
});
