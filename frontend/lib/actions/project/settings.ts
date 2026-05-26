/**
 * Typed view of `projects.settings` JSONB. New settings = add a key here +
 * mirror in the Rust `ProjectSettings` struct (`app-server/src/db/projects.rs`).
 *
 * - Writes go through `updateProjectSettings` (this file). It validates the
 *   partial input via Zod, applies tier gates per key, merges with the
 *   existing JSONB via Postgres `||`, and invalidates the app-server's
 *   `project:{id}` cache so the next ingest batch sees the new value.
 * - The Rust app-server is read-only; it deserializes via serde_json with
 *   `#[serde(default)]` on every field so older rows / unknown keys don't
 *   break.
 */
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { cache, PROJECT_CACHE_KEY } from "@/lib/cache";
import { db } from "@/lib/db/drizzle";
import { projects, subscriptionTiers, workspaces } from "@/lib/db/migrations/schema";

export const ProjectSettingsSchema = z
  .object({
    /// Route every span on this project through the pii-redactor before
    /// storage. Pro-tier gated server-side.
    removePii: z.boolean(),
  })
  // `.strict()` rejects unknown keys — a typo in the UI surfaces as 400
  // rather than silently dropping into the JSONB row.
  .strict();

export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

/// Defaults applied when the row's JSONB is missing a key. Mirror of the
/// Rust `Default for ProjectSettings`.
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  removePii: false,
};

export const UpdateProjectSettingsSchema = z.object({
  projectId: z.guid(),
  // `Partial` so callers can update one key without re-sending all of them.
  settings: ProjectSettingsSchema.partial(),
});

/// Per-key tier gate. A setting whose key is absent here is allowed on every
/// tier; a present key requires the workspace tier to match the predicate.
const PRO_TIER_KEYS = new Set<keyof ProjectSettings>(["removePii"]);

const PRO_LIKE_TIERS = new Set(["pro", "enterprise"]);

export async function updateProjectSettings(input: z.infer<typeof UpdateProjectSettingsSchema>) {
  const { projectId, settings } = UpdateProjectSettingsSchema.parse(input);

  if (Object.keys(settings).length === 0) {
    return { success: true };
  }

  // Pro-tier gate: keep server-side. UI greys the same controls but a
  // forged request must still be rejected. We only run the lookup if the
  // request actually touches a gated key.
  const enablesGatedKey = (Object.keys(settings) as (keyof ProjectSettings)[]).some(
    (k) => PRO_TIER_KEYS.has(k) && settings[k] === true
  );
  if (enablesGatedKey) {
    const rows = await db
      .select({ tierName: subscriptionTiers.name })
      .from(projects)
      .innerJoin(workspaces, eq(projects.workspaceId, workspaces.id))
      .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
      .where(eq(projects.id, projectId))
      .limit(1);
    if (rows.length === 0) {
      throw new Error("Project not found");
    }
    const tierName = rows[0].tierName?.toLowerCase().trim();
    if (!tierName || !PRO_LIKE_TIERS.has(tierName)) {
      throw new Error("This setting requires the Pro tier");
    }
  }

  // JSONB `||` is the natural partial-update primitive — top-level keys in
  // the incoming object overwrite their counterparts in the stored object,
  // unspecified keys are left alone. No read-modify-write race.
  const result = await db
    .update(projects)
    .set({ settings: sql`${projects.settings} || ${JSON.stringify(settings)}::jsonb` })
    .where(eq(projects.id, projectId));
  if (result.count === 0) {
    throw new Error("Project not found");
  }

  // App-server caches `ProjectWithWorkspaceBillingInfo` per project id; the
  // settings row lives on that cached struct, so invalidate before
  // returning so the next ingest batch picks up the change.
  await cache.remove(`${PROJECT_CACHE_KEY}:${projectId}`);

  return { success: true };
}

