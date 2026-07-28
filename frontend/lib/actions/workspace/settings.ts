/**
 * Typed view of `workspaces.settings` JSONB. Same shape of contract as
 * `projects.settings` (see `lib/actions/project/settings.ts`): one column for
 * all workspace-level knobs, so a new setting is a field here, not a migration.
 */
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { db } from "@/lib/db/drizzle";
import { workspaces } from "@/lib/db/migrations/schema";

export const WorkspaceSettingsSchema = z
  .object({
    /// When true, Customer Data in this workspace is excluded from any Laminar
    /// training corpus. Default true — the opt-out is disabling it, which is an
    /// affirmative act by an owner. See /policies/data-use.
    privacyMode: z.boolean(),
  })
  .strict();

export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;

/// Absence means enabled: workspaces created before this column existed have
/// `{}` and must read as privacy-mode-on, never as opted in to training.
export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  privacyMode: true,
};

export const UpdateWorkspaceSettingsSchema = z.object({
  workspaceId: z.guid(),
  settings: WorkspaceSettingsSchema.partial(),
});

/// Reads are deliberately NOT strict: the write path rejects unknown keys, but a
/// stray key already in the row (older writer, manual edit) must not make a
/// stored `privacyMode: false` unreadable and silently read back as opted out of
/// training. Unknown keys are ignored; a malformed value falls back to default.
const WorkspaceSettingsReadSchema = z.looseObject({
  privacyMode: z.boolean().optional(),
});

export const parseWorkspaceSettings = (raw: unknown): WorkspaceSettings => {
  const parsed = WorkspaceSettingsReadSchema.safeParse(raw ?? {});
  if (!parsed.success) return DEFAULT_WORKSPACE_SETTINGS;
  return { privacyMode: parsed.data.privacyMode ?? DEFAULT_WORKSPACE_SETTINGS.privacyMode };
};

export const getWorkspaceSettings = async (workspaceId: string): Promise<WorkspaceSettings> => {
  const [row] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!row) {
    throw new Error("Workspace not found");
  }

  return parseWorkspaceSettings(row.settings);
};

export async function updateWorkspaceSettings(input: z.infer<typeof UpdateWorkspaceSettingsSchema>) {
  const { workspaceId, settings } = UpdateWorkspaceSettingsSchema.parse(input);

  if (Object.keys(settings).length === 0) {
    return { success: true };
  }

  // Disabling privacy mode is what grants the training licence under ToS §20,
  // so it is owner-only — an admin cannot opt the workspace in.
  await checkUserWorkspaceRole({ workspaceId, roles: ["owner"] });

  const result = await db
    .update(workspaces)
    .set({ settings: sql`${workspaces.settings} || ${JSON.stringify(settings)}::jsonb` })
    .where(eq(workspaces.id, workspaceId));

  if (result.count === 0) {
    throw new Error("Workspace not found");
  }

  return { success: true };
}
