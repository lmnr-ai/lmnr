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
import { type PrivacyModeState } from "@/lib/workspaces/types";

export const WorkspaceSettingsSchema = z
  .object({
    /// Cloud-only. The workspace owner's EXPLICIT Privacy Mode choice.
    /// Absent = unset (tri-state): defaults then apply per plan via
    /// `resolvePrivacyMode`. An explicit choice survives plan changes.
    privacyMode: z.boolean(),
    /// Protection floor stamped when a workspace whose resolved Privacy Mode
    /// was ON is downgraded to a tier whose default is OFF, so a plan change
    /// never lowers protection. Not an explicit user choice — an explicit
    /// choice takes precedence over it.
    privacyModeProtected: z.boolean(),
    /// Set out-of-band (ops) for accounts covered by a signed data processing
    /// agreement. Forces Privacy Mode ON and locks the toggle; overrides an
    /// explicit_off recorded before the DPA was signed. Deliberately NOT
    /// writable through the public settings route.
    dpaEnforcedPrivacyMode: z.boolean(),
  })
  .partial()
  // Reject unknown keys — a typo surfaces as 400 rather than silently
  // landing in the JSONB row.
  .strict();

export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;

/// The subset of settings the PATCH route accepts. `dpaEnforcedPrivacyMode`
/// and `privacyModeProtected` are system-managed.
export const UpdatableWorkspaceSettingsSchema = WorkspaceSettingsSchema.pick({ privacyMode: true });

export const parseWorkspaceSettings = (raw: unknown): WorkspaceSettings => {
  const parsed = WorkspaceSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
};

const TIER_DEFAULT_OFF = new Set(["free", "hobby", "starter"]);

/// A tier's Privacy Mode default. Free/Starter (internal key `hobby`)
/// default OFF; Pro and above — and anything unrecognized — default ON.
export const tierDefaultsToOn = (tierName?: string | null): boolean =>
  !TIER_DEFAULT_OFF.has((tierName ?? "").trim().toLowerCase());

/**
 * Whether a tier transition must stamp the protection floor: leaving a
 * default-ON tier for a default-OFF one, so the transition doesn't silently
 * lower protection.
 */
export const shouldStampProtectionFloor = (
  previousTierName: string | null | undefined,
  newTierName: string | null | undefined
): boolean => !tierDefaultsToOn(newTierName) && tierDefaultsToOn(previousTierName);

/**
 * Resolves the workspace's effective Privacy Mode. Precedence: DPA
 * enforcement (locked ON) > explicit owner choice > protection floor from a
 * past downgrade > per-plan default.
 */
export const resolvePrivacyMode = (settings: WorkspaceSettings, tierName?: string | null): PrivacyModeState => {
  if (settings.dpaEnforcedPrivacyMode) {
    return { enabled: true, locked: true };
  }
  if (typeof settings.privacyMode === "boolean") {
    return { enabled: settings.privacyMode, locked: false };
  }
  if (settings.privacyModeProtected) {
    return { enabled: true, locked: false };
  }
  return { enabled: tierDefaultsToOn(tierName), locked: false };
};

const UpdateWorkspaceSettingsSchema = z.object({
  workspaceId: z.guid(),
  // `Partial` via the schema itself so callers can update one key without
  // re-sending all of them.
  settings: UpdatableWorkspaceSettingsSchema,
});

export async function updateWorkspaceSettings(input: z.infer<typeof UpdateWorkspaceSettingsSchema>) {
  const { workspaceId, settings } = UpdateWorkspaceSettingsSchema.parse(input);

  // Privacy Mode is a workspace-wide data-governance decision — owner only.
  await checkUserWorkspaceRole({ workspaceId, roles: ["owner"] });

  if (Object.keys(settings).length === 0) {
    return { success: true };
  }

  if (settings.privacyMode !== undefined) {
    const row = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
      columns: { settings: true },
    });
    if (!row) {
      throw new Error("Workspace not found");
    }
    if (parseWorkspaceSettings(row.settings).dpaEnforcedPrivacyMode) {
      throw new Error("Privacy Mode is enforced by your organization's data processing agreement.");
    }
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

/**
 * Called from the Stripe webhook on tier transitions. When a workspace with no
 * explicit owner choice moves from a default-ON tier to a default-OFF one,
 * stamp the protection floor so the transition doesn't lower protection. Never
 * touches explicit choices, and never stamps a transition between two
 * default-OFF tiers (e.g. Free → Hobby).
 */
export async function preservePrivacyModeOnDowngrade(
  workspaceId: string,
  previousTierName: string | null | undefined,
  newTierName: string | null | undefined
) {
  if (!shouldStampProtectionFloor(previousTierName, newTierName)) {
    return;
  }
  const row = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { settings: true },
  });
  if (!row) {
    return;
  }
  const settings = parseWorkspaceSettings(row.settings);
  if (typeof settings.privacyMode === "boolean" || settings.privacyModeProtected) {
    return;
  }
  await db
    .update(workspaces)
    .set({ settings: sql`${workspaces.settings} || '{"privacyModeProtected": true}'::jsonb` })
    .where(eq(workspaces.id, workspaceId));
}
