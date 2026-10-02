import { eq } from "drizzle-orm";

import { SIGNALS_SIGNUP_CREDIT_MICRO_USD } from "@/lib/billing/tiers";
import { db } from "@/lib/db/drizzle";
import { workspaces } from "@/lib/db/migrations/schema";

export const isSameSignalCreditPeriod = (periodStart: Date, usageResetTime: Date): boolean =>
  periodStart.toISOString().slice(0, 10) === usageResetTime.toISOString().slice(0, 10);

export const calculateBillableSignalCostMicroUsd = (
  grossCostMicroUsd: number,
  appliedCreditMicroUsd: number,
  recurringAllowanceMicroUsd = 0
): number => Math.max(0, grossCostMicroUsd - recurringAllowanceMicroUsd - appliedCreditMicroUsd);

export interface SignalCreditState {
  grantedMicroUsd: number;
  remainingMicroUsd: number;
  appliedThisPeriodMicroUsd: number;
  availableThisPeriodMicroUsd: number;
  appliedDeltaMicroUsd: number;
}

export function calculateSignalCreditState({
  remainingMicroUsd,
  previouslyAppliedMicroUsd,
  currentPeriodCostMicroUsd,
}: {
  remainingMicroUsd: number;
  previouslyAppliedMicroUsd: number;
  currentPeriodCostMicroUsd: number;
}): SignalCreditState {
  const appliedBeforeReconciliation = previouslyAppliedMicroUsd;
  const availableThisPeriodMicroUsd = remainingMicroUsd + appliedBeforeReconciliation;
  const appliedThisPeriodMicroUsd = Math.max(
    appliedBeforeReconciliation,
    Math.min(availableThisPeriodMicroUsd, Math.max(0, Math.round(currentPeriodCostMicroUsd)))
  );

  return {
    grantedMicroUsd: availableThisPeriodMicroUsd > 0 ? SIGNALS_SIGNUP_CREDIT_MICRO_USD : 0,
    remainingMicroUsd: availableThisPeriodMicroUsd - appliedThisPeriodMicroUsd,
    appliedThisPeriodMicroUsd,
    availableThisPeriodMicroUsd,
    appliedDeltaMicroUsd: appliedThisPeriodMicroUsd - appliedBeforeReconciliation,
  };
}

/**
 * Reconcile a workspace's lifetime Signals credit against gross usage in the
 * current Signals usage window. The row lock makes frontend checks and
 * app-server usage updates converge without granting the credit twice.
 */
export async function reconcileSignalCredit(
  workspaceId: string,
  usageResetTime: Date,
  currentPeriodCostMicroUsd: number
): Promise<SignalCreditState> {
  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .select({
        remainingMicroUsd: workspaces.signalCreditRemainingMicroUsd,
        appliedMicroUsd: workspaces.signalCreditAppliedMicroUsd,
        periodStart: workspaces.signalCreditPeriodStart,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)
      .for("update");

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const eligibleForCredit = workspace.periodStart !== null;
    const samePeriod =
      workspace.periodStart !== null && isSameSignalCreditPeriod(new Date(workspace.periodStart), usageResetTime);
    const state = calculateSignalCreditState({
      remainingMicroUsd: Number(workspace.remainingMicroUsd),
      previouslyAppliedMicroUsd: samePeriod ? Number(workspace.appliedMicroUsd) : 0,
      currentPeriodCostMicroUsd,
    });

    await tx
      .update(workspaces)
      .set({
        signalCreditRemainingMicroUsd: state.remainingMicroUsd,
        signalCreditAppliedMicroUsd: state.appliedThisPeriodMicroUsd,
        signalCreditPeriodStart: eligibleForCredit ? usageResetTime.toISOString() : null,
      })
      .where(eq(workspaces.id, workspaceId));

    return state;
  });
}
