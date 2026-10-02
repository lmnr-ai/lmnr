import { eq } from "drizzle-orm";

import { SIGNALS_SIGNUP_CREDIT_MICRO_USD } from "@/lib/billing/tiers";
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
}

export function calculateSignalCreditState({
  persistedRemainingMicroUsd,
  pendingUncreditedCostMicroUsd,
  creditedCostThisPeriodMicroUsd,
}: {
  persistedRemainingMicroUsd: number | null;
  pendingUncreditedCostMicroUsd: number;
  creditedCostThisPeriodMicroUsd: number;
}): SignalCreditState {
  if (persistedRemainingMicroUsd === null) {
    return { grantedMicroUsd: 0, remainingMicroUsd: 0, appliedThisPeriodMicroUsd: 0 };
  }

  return {
    grantedMicroUsd: SIGNALS_SIGNUP_CREDIT_MICRO_USD,
    remainingMicroUsd: Math.max(0, persistedRemainingMicroUsd - Math.max(0, pendingUncreditedCostMicroUsd)),
    appliedThisPeriodMicroUsd: Math.max(0, creditedCostThisPeriodMicroUsd),
  };
}

/**
 * Read the meter job's durable credit balance. Pending unclassified runs are
 * deducted for display/enforcement until the job marks each whole run credited
 * or billable.
 */
export async function getSignalCreditState(
  workspaceId: string,
  pendingUncreditedCostMicroUsd: number,
  creditedCostThisPeriodMicroUsd: number
): Promise<SignalCreditState> {
  const [workspace] = await db
    .select({ remainingMicroUsd: workspaces.signalCreditRemainingMicroUsd })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  return calculateSignalCreditState({
    persistedRemainingMicroUsd: workspace.remainingMicroUsd === null ? null : Number(workspace.remainingMicroUsd),
    pendingUncreditedCostMicroUsd,
    creditedCostThisPeriodMicroUsd,
  });
}
