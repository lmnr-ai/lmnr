import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { db } from "@/lib/db/drizzle";
import { workspaceUsageLimits } from "@/lib/db/migrations/schema";

import { invalidateProjectCacheForWorkspace, isFreeTierWorkspace } from "./utils";

export const USAGE_LIMIT_TYPES = ["bytes", "signal_steps_processed"] as const;
export type UsageLimitType = (typeof USAGE_LIMIT_TYPES)[number];

export interface WorkspaceUsageLimit {
  id: string;
  workspaceId: string;
  limitType: UsageLimitType;
  limitValue: number;
}

const GetUsageLimitsSchema = z.object({
  workspaceId: z.string(),
});

const SetUsageLimitSchema = z.object({
  workspaceId: z.string(),
  limitType: z.enum(USAGE_LIMIT_TYPES),
  limitValue: z.number().int().nonnegative(),
});

const RemoveUsageLimitSchema = z.object({
  workspaceId: z.string(),
  limitType: z.enum(USAGE_LIMIT_TYPES),
});

export async function getUsageLimits(input: z.infer<typeof GetUsageLimitsSchema>): Promise<WorkspaceUsageLimit[]> {
  const { workspaceId } = GetUsageLimitsSchema.parse(input);

  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin", "member"] });

  const limits = await db
    .select({
      id: workspaceUsageLimits.id,
      workspaceId: workspaceUsageLimits.workspaceId,
      limitType: workspaceUsageLimits.limitType,
      limitValue: workspaceUsageLimits.limitValue,
    })
    .from(workspaceUsageLimits)
    .where(eq(workspaceUsageLimits.workspaceId, workspaceId));

  return limits as WorkspaceUsageLimit[];
}

export async function setUsageLimit(input: z.infer<typeof SetUsageLimitSchema>): Promise<WorkspaceUsageLimit> {
  const { workspaceId, limitType, limitValue } = SetUsageLimitSchema.parse(input);

  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin"] });

  if (await isFreeTierWorkspace(workspaceId)) {
    throw new Error("Custom usage limits are not available on the free tier.");
  }

  const [result] = await db
    .insert(workspaceUsageLimits)
    .values({
      workspaceId,
      limitType,
      limitValue,
    })
    .onConflictDoUpdate({
      target: [workspaceUsageLimits.workspaceId, workspaceUsageLimits.limitType],
      set: { limitValue },
    })
    .returning({
      id: workspaceUsageLimits.id,
      workspaceId: workspaceUsageLimits.workspaceId,
      limitType: workspaceUsageLimits.limitType,
      limitValue: workspaceUsageLimits.limitValue,
    });

  // Invalidate project cache entries for all projects in this workspace
  // so the app-server picks up the new limits
  await invalidateProjectCacheForWorkspace(workspaceId);

  return result as WorkspaceUsageLimit;
}

export async function removeUsageLimit(input: z.infer<typeof RemoveUsageLimitSchema>): Promise<void> {
  const { workspaceId, limitType } = RemoveUsageLimitSchema.parse(input);

  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin"] });

  if (await isFreeTierWorkspace(workspaceId)) {
    throw new Error("Custom usage limits are not available on the free tier.");
  }

  await db
    .delete(workspaceUsageLimits)
    .where(and(eq(workspaceUsageLimits.workspaceId, workspaceId), eq(workspaceUsageLimits.limitType, limitType)));

  await invalidateProjectCacheForWorkspace(workspaceId);
}
