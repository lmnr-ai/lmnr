import { count, eq } from "drizzle-orm";

import { getWorkspaceUsage } from "@/lib/actions/workspace";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, subscriptionTiers, workspaces } from "@/lib/db/migrations/schema";

import { type WorkspaceStats } from "./types";

const bytesToGB = (bytes: number): number => bytes / (1024 * 1024 * 1024);

export async function getWorkspaceStats(workspaceId: string): Promise<WorkspaceStats> {
  // First, get member count for the workspace
  const membersCount = await db
    .select({ count: count() })
    .from(membersOfWorkspaces)
    .where(eq(membersOfWorkspaces.workspaceId, workspaceId));

  const members = membersCount[0]?.count || 0;

  const limitsRows = await db
    .select({
      tierName: subscriptionTiers.name,
      bytesLimit: subscriptionTiers.bytesIngested,
      signalRunsLimit: subscriptionTiers.signalRuns,
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

  // Calculate GB overages
  const gbOverLimit = Math.max(gbUsedThisMonth - gbLimit, 0);
  const gbOverLimitCost = gbOverLimit * 2; // $2 per GB overage based on pricing

  return {
    tierName: limits.tierName,
    resetTime: usage.resetTime.toISOString(),
    gbUsedThisMonth,
    gbLimit,
    gbOverLimit,
    gbOverLimitCost,
    // TODO: Implement signal runs usage
    signalRunsUsedThisMonth: 0,
    signalRunsLimit: limits.signalRunsLimit,
    signalRunsOverLimit: 0,
    signalRunsOverLimitCost: 0,
  };
}
