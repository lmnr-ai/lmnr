/**
 * Typed view of `workspaces.settings` JSONB — the workspace-level twin of
 * `projects.settings` (`lib/actions/project/settings.ts`). One row per
 * workspace, one column for all settings; adding a setting = add a key here,
 * no migration.
 *
 * Writes go through `updateWorkspaceSettings` (owner-only), which merges the
 * partial input via Postgres `||` so unspecified keys are preserved without a
 * read-modify-write race.
 */
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { db } from "@/lib/db/drizzle";
import { workspaces } from "@/lib/db/migrations/schema";

export const WorkspaceSettingsSchema = z
  .object({
    /// Cloud-only. When true (the default), no data from this workspace's
    /// projects is used to train or improve Laminar models. Disabling it
    /// opts the workspace's redacted trace data into model improvement — see
    /// /policies/data-use. Self-hosted deployments never send data to
    /// Laminar, so the toggle is hidden there and the value is inert.
    privacyMode: z.boolean(),
  })
  // Reject unknown keys — a typo surfaces as 400 rather than silently
  // landing in the JSONB row.
  .strict();

export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;

/// Defaults applied when the row's JSONB is missing a key. Privacy Mode is
/// ON by default: workspaces are excluded from model improvement unless the
/// owner explicitly opts in.
export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  privacyMode: true,
};

export const parseWorkspaceSettings = (raw: unknown): WorkspaceSettings => {
  const parsed = WorkspaceSettingsSchema.partial().safeParse(raw ?? {});
  return { ...DEFAULT_WORKSPACE_SETTINGS, ...(parsed.success ? parsed.data : {}) };
};

const UpdateWorkspaceSettingsSchema = z.object({
  workspaceId: z.guid(),
  // `Partial` so callers can update one key without re-sending all of them.
  settings: WorkspaceSettingsSchema.partial(),
});

export async function updateWorkspaceSettings(input: z.infer<typeof UpdateWorkspaceSettingsSchema>) {
  const { workspaceId, settings } = UpdateWorkspaceSettingsSchema.parse(input);

  // Privacy Mode is a workspace-wide data-governance decision — owner only.
  await checkUserWorkspaceRole({ workspaceId, roles: ["owner"] });

  if (Object.keys(settings).length === 0) {
    return { success: true };
  }

  const result = await db
    .update(workspaces)
    .set({ settings: sql`${workspaces.settings} || ${JSON.stringify(settings)}::jsonb` })
    .where(eq(workspaces.id, workspaceId));
  if (result.count === 0) {
    throw new Error("Workspace not found");
  }

  return { success: true };
}
