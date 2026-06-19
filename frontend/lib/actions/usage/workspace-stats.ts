import { eq } from "drizzle-orm";

import { getWorkspaceUsage } from "@/lib/actions/workspace";
import { db } from "@/lib/db/drizzle";
import { subscriptionTiers, workspaces } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

import { type WorkspaceStats } from "./types";

const bytesToGB = (bytes: number): number => bytes / (1024 * 1024 * 1024);

export async function getWorkspaceStats(workspaceId: string): Promise<WorkspaceStats> {
  const usage = await getWorkspaceUsage(workspaceId);
  const gbUsedThisMonth = bytesToGB(usage.totalBytesIngested);
  const signalStepsUsedThisMonth = usage.totalSignalSteps;

  if (!isFeatureEnabled(Feature.SUBSCRIPTION)) {
    return {
      resetTime: usage.resetTime.toISOString(),
      gbUsedThisMonth,
      signalStepsUsedThisMonth: signalStepsUsedThisMonth,
    };
  }

  const limitsRows = await db
    .select({
      tierName: subscriptionTiers.name,
      bytesLimit: subscriptionTiers.bytesIngested,
      signalStepsLimit: subscriptionTiers.signalStepsProcessed,
      extraBytePrice: subscriptionTiers.extraBytePrice,
      extraSignalStepPrice: subscriptionTiers.extraSignalStepPrice,
    })
    .from(workspaces)
    .innerJoin(subscriptionTiers, eq(subscriptionTiers.id, workspaces.tierId))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!limitsRows[0]) {
    throw new Error(`Workspace stats not found for workspace ${workspaceId}`);
  }

  const limits = limitsRows[0];
  const gbLimit = bytesToGB(Number(limits.bytesLimit));

  const gbOverLimit = Math.max(gbUsedThisMonth - gbLimit, 0);
  const gbOverLimitCost = gbOverLimit * limits.extraBytePrice;

  const signalStepsLimit = Number(limits.signalStepsLimit);
  const signalStepsOverLimit = Math.max(signalStepsUsedThisMonth - signalStepsLimit, 0);
  const signalStepsOverLimitCost = signalStepsOverLimit * limits.extraSignalStepPrice;

  return {
    tierName: limits.tierName,
    resetTime: usage.resetTime.toISOString(),
    gbUsedThisMonth,
    gbLimit,
    gbOverLimit,
    gbOverLimitCost,
    signalStepsUsedThisMonth,
    signalStepsLimit,
    signalStepsOverLimit,
    signalStepsOverLimitCost,
  };
}
