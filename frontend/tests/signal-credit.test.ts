import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateBillableSignalCostMicroUsd,
  calculateSignalCreditState,
  isSameSignalCreditPeriod,
} from "../lib/actions/usage/signal-credit";

test("matches credit periods by UTC billing date despite timestamp normalization", () => {
  assert.equal(isSameSignalCreditPeriod(new Date("2026-10-02T14:00:00Z"), new Date("2026-10-02T00:00:00Z")), true);
  assert.equal(isSameSignalCreditPeriod(new Date("2026-10-02T14:00:00Z"), new Date("2026-11-02T14:00:00Z")), false);
});

const CREDIT = 5_000_000;

test("applies a new workspace credit without exceeding current-period usage", () => {
  assert.deepEqual(
    calculateSignalCreditState({
      remainingMicroUsd: CREDIT,
      previouslyAppliedMicroUsd: 0,
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

test("uses the externally reset applied amount in a new billing period", () => {
  assert.deepEqual(
    calculateSignalCreditState({
      remainingMicroUsd: 3_750_000,
      previouslyAppliedMicroUsd: 0,
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

test("continues applying Free credit against lifetime cumulative usage", () => {
  assert.deepEqual(
    calculateSignalCreditState({
      remainingMicroUsd: 3_000_000,
      previouslyAppliedMicroUsd: 2_000_000,
      currentPeriodCostMicroUsd: 3_000_000,
    }),
    {
      grantedMicroUsd: CREDIT,
      remainingMicroUsd: 2_000_000,
      appliedThisPeriodMicroUsd: 3_000_000,
      availableThisPeriodMicroUsd: CREDIT,
      appliedDeltaMicroUsd: 1_000_000,
    }
  );
});

test("does not restore spent credit when reported usage temporarily decreases", () => {
  assert.deepEqual(
    calculateSignalCreditState({
      remainingMicroUsd: 3_000_000,
      previouslyAppliedMicroUsd: 2_000_000,
      currentPeriodCostMicroUsd: 0,
    }),
    {
      grantedMicroUsd: CREDIT,
      remainingMicroUsd: 3_000_000,
      appliedThisPeriodMicroUsd: 2_000_000,
      availableThisPeriodMicroUsd: CREDIT,
      appliedDeltaMicroUsd: 0,
    }
  );
});

test("does not grant credit to pre-deployment workspaces", () => {
  assert.deepEqual(
    calculateSignalCreditState({
      remainingMicroUsd: 0,
      previouslyAppliedMicroUsd: 0,
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
      remainingMicroUsd: 2_000_000,
      previouslyAppliedMicroUsd: 3_000_000,
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
