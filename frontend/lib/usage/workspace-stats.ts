import { count, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import {
  membersOfWorkspaces,
  subscriptionTiers,
  workspaces,
  workspaceUsage,
} from "@/lib/db/migrations/schema";

import { WorkspaceStats } from "./types";

export async function getWorkspaceStats(workspaceId: string): Promise<WorkspaceStats> {
  // First, get member count for the workspace
  const membersCount = await db
    .select({ count: count() })
    .from(membersOfWorkspaces)
    .where(eq(membersOfWorkspaces.workspaceId, workspaceId));

  const members = membersCount[0]?.count || 0;

  const result = await db
    .select({
      tierName: subscriptionTiers.name,
      seatsIncludedInTier: subscriptionTiers.membersPerWorkspace,
      totalSpans: workspaceUsage.spanCount,
      spansThisMonth: workspaceUsage.spanCountSinceReset,
      totalSteps: workspaceUsage.stepCount,
      stepsThisMonth: workspaceUsage.stepCountSinceReset,
      spansLimit: subscriptionTiers.spans,
      stepsLimit: subscriptionTiers.steps,
      spansOverLimit: sql<number>`GREATEST(${workspaceUsage.spanCountSinceReset} - ${subscriptionTiers.spans}, 0)`,
      spansOverLimitCost: sql<number>`GREATEST(${workspaceUsage.spanCountSinceReset} - ${subscriptionTiers.spans}, 0)::float8 * ${subscriptionTiers.extraSpanPrice}`,
      stepsOverLimit: sql<number>`GREATEST(${workspaceUsage.stepCountSinceReset} - ${subscriptionTiers.steps}, 0)`,
      stepsOverLimitCost: sql<number>`GREATEST(${workspaceUsage.stepCountSinceReset} - ${subscriptionTiers.steps}, 0)::float8 * ${subscriptionTiers.extraStepPrice}`,
      membersLimit: sql<number>`${subscriptionTiers.membersPerWorkspace} + ${workspaces.additionalSeats}`,
      storageLimit: subscriptionTiers.storageMib,
      resetTime: workspaceUsage.resetTime,
      // Bytes ingested fields for GB calculation
      totalBytesIngested: sql<number>`${workspaceUsage.spansBytesIngested} + ${workspaceUsage.browserSessionEventsBytesIngested}`,
      bytesIngestedThisMonth: sql<number>`${workspaceUsage.spansBytesIngestedSinceReset} + ${workspaceUsage.browserSessionEventsBytesIngestedSinceReset}`,
      bytesLimit: subscriptionTiers.bytesIngested,
    })
    .from(workspaceUsage)
    .innerJoin(workspaces, eq(workspaces.id, workspaceUsage.workspaceId))
    .innerJoin(subscriptionTiers, eq(subscriptionTiers.id, workspaces.tierId))
    .where(eq(workspaceUsage.workspaceId, workspaceId))
    .limit(1);

  if (!result[0]) {
    throw new Error(`Workspace stats not found for workspace ${workspaceId}`);
  }

  const stats = result[0];

  // Convert bytes to GB (1 GB = 1024^3 bytes)
  const bytesToGB = (bytes: number): number => bytes / (1024 * 1024 * 1024);

  const totalGBUsed = bytesToGB(Number(stats.totalBytesIngested));
  const gbUsedThisMonth = bytesToGB(Number(stats.bytesIngestedThisMonth));
  const gbLimit = bytesToGB(Number(stats.bytesLimit));

  // Calculate GB overages
  const gbOverLimit = Math.max(gbUsedThisMonth - gbLimit, 0);
  const gbOverLimitCost = gbOverLimit * 2; // $2 per GB overage based on pricing

  return {
    tierName: stats.tierName,
    seatsIncludedInTier: Number(stats.seatsIncludedInTier),
    totalSpans: Number(stats.totalSpans),
    spansThisMonth: Number(stats.spansThisMonth),
    spansLimit: Number(stats.spansLimit),
    spansOverLimit: Number(stats.spansOverLimit),
    spansOverLimitCost: Number(stats.spansOverLimitCost),
    members: Number(members),
    membersLimit: Number(stats.membersLimit),
    resetTime: stats.resetTime,
    stepsLimit: Number(stats.stepsLimit),
    stepsOverLimit: Number(stats.stepsOverLimit),
    stepsOverLimitCost: Number(stats.stepsOverLimitCost),
    stepsThisMonth: Number(stats.stepsThisMonth),
    // GB usage fields
    totalGBUsed,
    gbUsedThisMonth,
    gbLimit,
    gbOverLimit,
    gbOverLimitCost,
  };
}
