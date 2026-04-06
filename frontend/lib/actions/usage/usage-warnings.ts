import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { db } from "@/lib/db/drizzle";
import { workspaceUsageWarnings } from "@/lib/db/migrations/schema";

import {
  invalidateProjectCacheForWorkspace,
  invalidateUsageWarningsCacheForWorkspace,
  isFreeTierWorkspace,
} from "./utils";

export const USAGE_WARNING_ITEMS = ["bytes", "signal_runs"] as const;
export type UsageWarningItem = (typeof USAGE_WARNING_ITEMS)[number];

export interface WorkspaceUsageWarning {
  id: string;
  workspaceId: string;
  usageItem: UsageWarningItem;
  limitValue: number;
}

const GetUsageWarningsSchema = z.object({
  workspaceId: z.string(),
});

const AddUsageWarningSchema = z.object({
  workspaceId: z.string(),
  usageItem: z.enum(USAGE_WARNING_ITEMS),
  limitValue: z.number().int().positive(),
});

const RemoveUsageWarningSchema = z.object({
  workspaceId: z.string(),
  id: z.string(),
});

export async function getUsageWarnings(
  input: z.infer<typeof GetUsageWarningsSchema>
): Promise<WorkspaceUsageWarning[]> {
  const { workspaceId } = GetUsageWarningsSchema.parse(input);

  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin", "member"] });

  const warnings = await db
    .select({
      id: workspaceUsageWarnings.id,
      workspaceId: workspaceUsageWarnings.workspaceId,
      usageItem: workspaceUsageWarnings.usageItem,
      limitValue: workspaceUsageWarnings.limitValue,
    })
    .from(workspaceUsageWarnings)
    .where(eq(workspaceUsageWarnings.workspaceId, workspaceId));

  return warnings as WorkspaceUsageWarning[];
}

export async function addUsageWarning(input: z.infer<typeof AddUsageWarningSchema>): Promise<WorkspaceUsageWarning> {
  const { workspaceId, usageItem, limitValue } = AddUsageWarningSchema.parse(input);

  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin"] });

  if (await isFreeTierWorkspace(workspaceId)) {
    throw new Error("Usage warnings are not available on the free tier.");
  }

  // Atomic insert: ON CONFLICT DO NOTHING returns no rows if a duplicate exists.
  const rows = await db
    .insert(workspaceUsageWarnings)
    .values({
      workspaceId,
      usageItem,
      limitValue,
    })
    .onConflictDoNothing()
    .returning({
      id: workspaceUsageWarnings.id,
      workspaceId: workspaceUsageWarnings.workspaceId,
      usageItem: workspaceUsageWarnings.usageItem,
      limitValue: workspaceUsageWarnings.limitValue,
    });

  if (rows.length === 0) {
    throw new Error("A warning with this threshold already exists.");
  }

  await Promise.all([
    invalidateProjectCacheForWorkspace(workspaceId),
    invalidateUsageWarningsCacheForWorkspace(workspaceId),
  ]);

  return rows[0] as WorkspaceUsageWarning;
}

export async function removeUsageWarning(input: z.infer<typeof RemoveUsageWarningSchema>): Promise<void> {
  const { workspaceId, id } = RemoveUsageWarningSchema.parse(input);

  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin"] });

  await db
    .delete(workspaceUsageWarnings)
    .where(and(eq(workspaceUsageWarnings.workspaceId, workspaceId), eq(workspaceUsageWarnings.id, id)));

  await Promise.all([
    invalidateProjectCacheForWorkspace(workspaceId),
    invalidateUsageWarningsCacheForWorkspace(workspaceId),
  ]);
}
