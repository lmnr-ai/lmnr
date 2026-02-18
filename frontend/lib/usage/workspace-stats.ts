import { eq } from "drizzle-orm";

import { getWorkspaceUsage } from "@/lib/actions/workspace";
import { db } from "@/lib/db/drizzle";
import { subscriptionTiers, workspaces } from "@/lib/db/migrations/schema";

import { type WorkspaceStats } from "./types";

const bytesToGB = (bytes: number): number => bytes / (1024 * 1024 * 1024);

export async function getWorkspaceStats(workspaceId: string): Promise<WorkspaceStats> {
  const limitsRows = await db
    .select({
      tierName: subscriptionTiers.name,
      bytesLimit: subscriptionTiers.bytesIngested,
      signalRunsLimit: subscriptionTiers.signalRuns,
      extraBytePrice: subscriptionTiers.extraBytePrice,
      extraSignalRunPrice: subscriptionTiers.extraSignalRunPrice,
    })
    .from(workspaces)
    .innerJoin(subscriptionTiers, eq(subscriptionTiers.id, workspaces.tierId))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!limitsRows[0]) {
    throw new Error(`Workspace stats not found for workspace ${workspaceId}`);
  }

  const limits = limitsRows[0];

  const usage = await getWorkspaceUsage(workspaceId);

  const gbUsedThisMonth = bytesToGB(usage.totalBytesIngested);
  const gbLimit = bytesToGB(Number(limits.bytesLimit));

  const gbOverLimit = Math.max(gbUsedThisMonth - gbLimit, 0);
  const gbOverLimitCost = gbOverLimit * limits.extraBytePrice;

  const signalRunsUsedThisMonth = usage.totalSignalRuns;
  const signalRunsLimit = Number(limits.signalRunsLimit);
  const signalRunsOverLimit = Math.max(signalRunsUsedThisMonth - signalRunsLimit, 0);
  const signalRunsOverLimitCost = signalRunsOverLimit * limits.extraSignalRunPrice;

  return {
    tierName: limits.tierName,
    resetTime: usage.resetTime.toISOString(),
    gbUsedThisMonth,
    gbLimit,
    gbOverLimit,
    gbOverLimitCost,
    signalRunsUsedThisMonth,
    signalRunsLimit,
    signalRunsOverLimit,
    signalRunsOverLimitCost,
  };
}
