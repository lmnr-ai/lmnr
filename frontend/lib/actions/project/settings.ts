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
import { Feature, isFeatureEnabled } from "@/lib/features/features";

/// `off`: store as received. `redact`: the redactor's output replaces the raw
/// text. `dual`: keep raw and redacted copies; the read path masks per role
/// (docs/internal/rbac.md). Mirror of the Rust `PiiMode`.
export const PII_MODES = ["off", "redact", "dual"] as const;
export type PiiMode = (typeof PII_MODES)[number];

export const ProjectSettingsSchema = z
  .object({
    /// PII handling for span input/output. Pro-tier gated server-side;
    /// `dual` additionally requires `Feature.PII_DUAL_MODE`. Only workspace
    /// owners/admins may change it (enforced in the settings route).
    piiMode: z.enum(PII_MODES),
    /// Per-project manual overrides of eval-score direction (score name ->
    /// isHigherBetter). Layered over the app-wide LLM-inferred defaults.
    /// Frontend-only; the Rust app-server ignores this key. Write the FULL
    /// map (JSONB `||` shallow-merges top-level keys, so a partial map would
    /// drop the other overrides).
    scoreDirectionOverrides: z.record(z.string(), z.boolean()),
  })
  // `.strict()` rejects unknown keys — a typo in the UI surfaces as 400
  // rather than silently dropping into the JSONB row.
  .strict();

export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

/// Defaults applied when the row's JSONB is missing a key. Mirror of the
/// Rust `Default for ProjectSettings`.
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  piiMode: "off",
  scoreDirectionOverrides: {},
};

/**
 * Stored JSONB → typed settings. Unknown or malformed keys fall back to
 * defaults. The pre-`piiMode` `removePii` toggle is translated (`true` →
 * `redact`) for rows written between the data migration and this deploy;
 * the Rust reader applies the same fallback.
 */
export function parseStoredProjectSettings(raw: unknown): ProjectSettings {
  const { removePii, ...rest } = (raw ?? {}) as Record<string, unknown>;
  if (rest.piiMode === undefined && removePii === true) {
    rest.piiMode = "redact";
  }
  const parsed = ProjectSettingsSchema.partial().safeParse(rest);
  return { ...DEFAULT_PROJECT_SETTINGS, ...(parsed.success ? parsed.data : {}) };
}

export const UpdateProjectSettingsSchema = z.object({
  projectId: z.guid(),
  // `Partial` so callers can update one key without re-sending all of them.
  settings: ProjectSettingsSchema.partial(),
});

/// Per-key tier gate: a present key requires the Pro tier whenever the
/// predicate says the value turns the feature on. Keys absent here are
/// allowed on every tier.
const PRO_TIER_GATES: Partial<{ [K in keyof ProjectSettings]: (value: ProjectSettings[K]) => boolean }> = {
  piiMode: (mode) => mode !== "off",
};

const PRO_LIKE_TIERS = new Set(["pro", "enterprise"]);

export async function updateProjectSettings(input: z.infer<typeof UpdateProjectSettingsSchema>) {
  const { projectId, settings } = UpdateProjectSettingsSchema.parse(input);

  if (Object.keys(settings).length === 0) {
    return { success: true };
  }

  // Pro-tier gate: keep server-side. UI greys the same controls but a
  // forged request must still be rejected. We only run the lookup if the
  // request actually touches a gated key. Self-hosted installs aren't on the
  // tiered billing plan (their only seeded tier is "unlimited"), so the Pro
  // gate doesn't apply there — skip it entirely off Laminar Cloud.
  const enablesGatedKey =
    isFeatureEnabled(Feature.LAMINAR_CLOUD) &&
    (Object.keys(settings) as (keyof ProjectSettings)[]).some((k) => {
      const gate = PRO_TIER_GATES[k] as ((value: unknown) => boolean) | undefined;
      return gate !== undefined && settings[k] !== undefined && gate(settings[k]);
    });
  if (settings.piiMode === "dual" && !isFeatureEnabled(Feature.PII_DUAL_MODE)) {
    throw new Error("Dual PII mode is not enabled on this deployment");
  }
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
