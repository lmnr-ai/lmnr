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
  const signalCostUsedThisMonth = usage.totalSignalCostMicroUsd;

  if (!isFeatureEnabled(Feature.SUBSCRIPTION)) {
    return {
      resetTime: usage.resetTime.toISOString(),
      gbUsedThisMonth,
      signalCostUsedThisMonth,
    };
  }

  const limitsRows = await db
    .select({
      tierName: subscriptionTiers.name,
      bytesLimit: subscriptionTiers.bytesIngested,
      signalCostLimit: subscriptionTiers.signalCostIncludedMicroUsd,
      extraBytePrice: subscriptionTiers.extraBytePrice,
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

  // Signal usage/limits are denominated in micro-USD (1e-6 USD): the cost is
  // already a dollar amount, so the overage cost is the overage itself in USD.
  const signalCostLimit = Number(limits.signalCostLimit);
  const signalCostOverLimit = Math.max(signalCostUsedThisMonth - signalCostLimit, 0);
  const signalCostOverLimitUsd = signalCostOverLimit / 1_000_000;

  return {
    tierName: limits.tierName,
    resetTime: usage.resetTime.toISOString(),
    gbUsedThisMonth,
    gbLimit,
    gbOverLimit,
    gbOverLimitCost,
    signalCostUsedThisMonth,
    signalCostLimit,
    signalCostOverLimit,
    signalCostOverLimitUsd,
  };
}
