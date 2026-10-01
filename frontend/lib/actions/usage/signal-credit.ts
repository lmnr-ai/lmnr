import { eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { workspaces } from "@/lib/db/migrations/schema";

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
  grantedMicroUsd,
  remainingMicroUsd,
  previouslyAppliedMicroUsd,
  samePeriod,
  currentPeriodCostMicroUsd,
}: {
  grantedMicroUsd: number;
  remainingMicroUsd: number;
  previouslyAppliedMicroUsd: number;
  samePeriod: boolean;
  currentPeriodCostMicroUsd: number;
}): SignalCreditState {
  const appliedBeforeReconciliation = samePeriod ? previouslyAppliedMicroUsd : 0;
  const availableThisPeriodMicroUsd = remainingMicroUsd + appliedBeforeReconciliation;
  const appliedThisPeriodMicroUsd = Math.min(
    availableThisPeriodMicroUsd,
    Math.max(0, Math.round(currentPeriodCostMicroUsd))
  );

  return {
    grantedMicroUsd,
    remainingMicroUsd: availableThisPeriodMicroUsd - appliedThisPeriodMicroUsd,
    appliedThisPeriodMicroUsd,
    availableThisPeriodMicroUsd,
    appliedDeltaMicroUsd: appliedThisPeriodMicroUsd - appliedBeforeReconciliation,
  };
}

/**
 * Reconcile a workspace's lifetime Signals credit against gross usage in the
 * current billing period. The row lock makes frontend checks and app-server
 * usage updates converge without granting the credit twice.
 */
export async function reconcileSignalCredit(
  workspaceId: string,
  periodStart: Date,
  currentPeriodCostMicroUsd: number
): Promise<SignalCreditState> {
  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .select({
        grantedMicroUsd: workspaces.signalCreditGrantedMicroUsd,
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

    const state = calculateSignalCreditState({
      grantedMicroUsd: Number(workspace.grantedMicroUsd),
      remainingMicroUsd: Number(workspace.remainingMicroUsd),
      previouslyAppliedMicroUsd: Number(workspace.appliedMicroUsd),
      samePeriod: new Date(workspace.periodStart).getTime() === periodStart.getTime(),
      currentPeriodCostMicroUsd,
    });

    await tx
      .update(workspaces)
      .set({
        signalCreditRemainingMicroUsd: state.remainingMicroUsd,
        signalCreditAppliedMicroUsd: state.appliedThisPeriodMicroUsd,
        signalCreditPeriodStart: periodStart.toISOString(),
      })
      .where(eq(workspaces.id, workspaceId));

    return state;
  });
}
