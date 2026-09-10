import { eq, inArray } from "drizzle-orm";

import { type LlmProfileConfig, type LlmProfileSecrets } from "@/lib/actions/llm-profiles/schema";
import { decodeApiKey, encryptValue } from "@/lib/crypto";
import { db } from "@/lib/db/drizzle";
import { llmProfileModels, llmProfiles, projects, providerApiKeys } from "@/lib/db/migrations/schema";

/**
 * Copies legacy project-scoped playground keys (`provider_api_keys`) into
 * workspace LLM profiles. Only credentials move; playgrounds are not touched
 * and their users pick a profile/model on next open. Nothing reads
 * `provider_api_keys` anymore, so rows are deleted once folded into a profile
 * and a re-run finds nothing to do.
 *
 * Runs at startup where `Feature.LOCAL_DB` applies migrations, and via
 * `pnpm db:migrate-provider-api-keys` for deployments that don't.
 */

/** One legacy playground provider: the env-var names it needed and the profile it becomes. */
type LegacyBundle = {
  label: string;
  vars: string[];
  toProfile: (vars: Record<string, string>) => {
    profile: LlmProfileConfig;
    secrets: LlmProfileSecrets;
    // A profile needs at least one model to be usable; legacy keys carried none,
    // so bundles seed the main current ones.
    models: string[];
  };
};

const apiKeyBundle = (
  label: string,
  envVar: string,
  provider: "openai_responses" | "anthropic" | "gemini" | "groq" | "mistral",
  models: string[]
): LegacyBundle => ({
  label,
  vars: [envVar],
  toProfile: (vars) => ({
    profile: { provider, config: { auth: { type: "api_key" } } },
    secrets: { apiKey: vars[envVar] },
    models,
  }),
});

// Seeded model ids: the main current model per tier for each provider, matching the ids
// `lib/ai/model.ts` and the app-server default to. Users can edit the list in the profile UI.
const BUNDLES: LegacyBundle[] = [
  // The old playground called `createOpenAI()(model)`, which is the Responses API.
  apiKeyBundle("OpenAI", "OPENAI_API_KEY", "openai_responses", [
    "gpt-5.6",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.4-mini",
  ]),
  apiKeyBundle("Anthropic", "ANTHROPIC_API_KEY", "anthropic", [
    "claude-fable-5",
    "claude-opus-5",
    "claude-sonnet-5",
    "claude-haiku-4-5-20251001",
  ]),
  apiKeyBundle("Gemini", "GEMINI_API_KEY", "gemini", [
    "gemini-3.1-pro-preview",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
  ]),
  apiKeyBundle("Groq", "GROQ_API_KEY", "groq", [
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
  ]),
  apiKeyBundle("Mistral", "MISTRAL_API_KEY", "mistral", ["mistral-large-latest", "mistral-small-latest"]),
  {
    label: "Bedrock",
    vars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
    toProfile: (vars) => ({
      profile: {
        provider: "bedrock",
        config: { region: vars.AWS_REGION, auth: { type: "aws_keys", accessKeyId: vars.AWS_ACCESS_KEY_ID } },
      },
      secrets: { secretAccessKey: vars.AWS_SECRET_ACCESS_KEY },
      models: [
        "us.anthropic.claude-opus-5",
        "us.anthropic.claude-sonnet-5",
        "us.anthropic.claude-haiku-4-5-20251001-v1:0",
      ],
    }),
  },
  // No Azure bundle: the old playground never read `OPENAI_AZURE_RESOURCE_ID` /
  // `OPENAI_AZURE_DEPLOYMENT_NAME`, so stored values were never validated by use and
  // can't be trusted. Those rows are left untouched; users create the profile by hand.
];

const KNOWN_VARS = [...new Set(BUNDLES.flatMap((b) => b.vars))];

type Candidate = {
  workspaceId: string;
  bundle: LegacyBundle;
  profile: LlmProfileConfig;
  secrets: LlmProfileSecrets;
  models: Set<string>;
  projectIds: Set<string>;
  projectNames: Set<string>;
  rowIds: Set<string>;
};

export type MigrationSummary = {
  legacyRows: number;
  undecryptable: number;
  profilesCreated: number;
  rowsDeleted: number;
};

type Options = {
  dryRun?: boolean;
  /**
   * Legacy rows are the idempotency marker: deleting them (default) makes
   * re-runs no-ops. Keeping them means a second apply duplicates profiles.
   */
  deleteLegacyRows?: boolean;
  log?: (message: string) => void;
};

export async function migrateProviderApiKeys({
  dryRun = false,
  deleteLegacyRows = true,
  log = console.log,
}: Options = {}) {
  const summary: MigrationSummary = {
    legacyRows: 0,
    undecryptable: 0,
    profilesCreated: 0,
    rowsDeleted: 0,
  };

  const rows = await db
    .select({
      id: providerApiKeys.id,
      name: providerApiKeys.name,
      nonceHex: providerApiKeys.nonceHex,
      value: providerApiKeys.value,
      projectId: providerApiKeys.projectId,
      projectName: projects.name,
      workspaceId: projects.workspaceId,
    })
    .from(providerApiKeys)
    .innerJoin(projects, eq(projects.id, providerApiKeys.projectId))
    .where(inArray(providerApiKeys.name, KNOWN_VARS));

  summary.legacyRows = rows.length;
  if (rows.length === 0) return summary;

  type ProjectKeys = {
    projectName: string;
    workspaceId: string;
    vars: Record<string, string>;
    rowIds: Record<string, string>;
  };
  const byProject = new Map<string, ProjectKeys>();
  // Undecryptable rows are excluded: the AEAD key may just be misconfigured on this boot.
  const deletableRowIds = new Set<string>();
  for (const row of rows) {
    let value: string;
    try {
      value = await decodeApiKey(row.name, row.nonceHex, row.value);
    } catch {
      summary.undecryptable += 1;
      log(`[provider-api-keys] cannot decrypt ${row.name} for project ${row.projectId}; skipping`);
      continue;
    }
    deletableRowIds.add(row.id);
    const entry = byProject.get(row.projectId) ?? {
      projectName: row.projectName,
      workspaceId: row.workspaceId,
      vars: {},
      rowIds: {},
    };
    entry.vars[row.name] = value;
    entry.rowIds[row.name] = row.id;
    byProject.set(row.projectId, entry);
  }

  // Identical credentials across projects of one workspace collapse into a single profile.
  const candidates = new Map<string, Candidate>();
  for (const [projectId, entry] of byProject) {
    for (const bundle of BUNDLES) {
      if (!bundle.vars.every((v) => entry.vars[v])) continue;
      const { profile, secrets, models } = bundle.toProfile(entry.vars);
      const key = JSON.stringify([entry.workspaceId, profile, secrets]);
      const candidate = candidates.get(key) ?? {
        workspaceId: entry.workspaceId,
        bundle,
        profile,
        secrets,
        models: new Set<string>(),
        projectIds: new Set<string>(),
        projectNames: new Set<string>(),
        rowIds: new Set<string>(),
      };
      for (const model of models) candidate.models.add(model);
      candidate.projectIds.add(projectId);
      candidate.projectNames.add(entry.projectName);
      for (const v of bundle.vars) candidate.rowIds.add(entry.rowIds[v]);
      candidates.set(key, candidate);
    }
  }

  const existing = await existingProfiles([...new Set([...candidates.values()].map((c) => c.workspaceId))]);
  const takenNames = existing.names;
  const perWorkspaceLabel = new Map<string, number>();
  for (const c of candidates.values()) {
    const k = `${c.workspaceId}:${c.bundle.label}`;
    perWorkspaceLabel.set(k, (perWorkspaceLabel.get(k) ?? 0) + 1);
  }

  for (const candidate of candidates.values()) {
    const { workspaceId, bundle } = candidate;
    const models = [...candidate.models].filter((m) => m.trim().length > 0);
    if (models.length === 0) {
      log(`[provider-api-keys] ${bundle.label} in workspace ${workspaceId} has no models; skipping`);
      continue;
    }
    const base =
      (perWorkspaceLabel.get(`${workspaceId}:${bundle.label}`) ?? 0) > 1
        ? `${bundle.label} (${[...candidate.projectNames][0]})`
        : bundle.label;
    const name = uniqueName(base, takenNames.get(workspaceId) ?? new Set());
    takenNames.set(workspaceId, (takenNames.get(workspaceId) ?? new Set()).add(name));

    log(
      `[provider-api-keys] ${dryRun ? "would create" : "creating"} profile "${name}" (${candidate.profile.provider}) in workspace ${workspaceId} ` +
        `from ${candidate.rowIds.size} key(s) across ${candidate.projectIds.size} project(s); models: ${models.join(", ")}`
    );
    if (existing.providers.get(workspaceId)?.has(candidate.profile.provider)) {
      log(
        `[provider-api-keys]   note: workspace ${workspaceId} already has a ${candidate.profile.provider} profile; ` +
          `this may be a duplicate from an earlier run that kept legacy rows`
      );
    }
    for (const id of candidate.rowIds) deletableRowIds.delete(id);
    if (dryRun) {
      summary.profilesCreated += 1;
      continue;
    }

    const profileId = crypto.randomUUID();
    // Same blob shape and AAD (profile id) the app-server writes in `llm/profiles/service/secrets.rs`.
    const encrypted = await encryptValue(profileId, JSON.stringify(candidate.secrets));
    await db.transaction(async (tx) => {
      await tx.insert(llmProfiles).values({
        id: profileId,
        workspaceId,
        name,
        provider: candidate.profile.provider,
        config: candidate.profile.config,
        secrets: encrypted,
      });
      await tx.insert(llmProfileModels).values(models.map((model) => ({ profileId, name: model })));
      if (deleteLegacyRows) {
        await tx.delete(providerApiKeys).where(inArray(providerApiKeys.id, [...candidate.rowIds]));
        summary.rowsDeleted += candidate.rowIds.size;
      }
    });
    summary.profilesCreated += 1;
  }

  // Decryptable rows that never completed a bundle (e.g. an AWS key without a
  // region) can't be used by anything anymore, so they are swept as well.
  if (deletableRowIds.size > 0) {
    log(
      `[provider-api-keys] ${deleteLegacyRows && !dryRun ? "deleting" : "found"} ${deletableRowIds.size} key(s) that do not form a complete provider setup`
    );
    if (deleteLegacyRows && !dryRun) {
      await db.delete(providerApiKeys).where(inArray(providerApiKeys.id, [...deletableRowIds]));
      summary.rowsDeleted += deletableRowIds.size;
    }
  }

  return summary;
}

/** Per workspace: profile names already taken and providers already configured. */
async function existingProfiles(workspaceIds: string[]) {
  const names = new Map<string, Set<string>>();
  const providers = new Map<string, Set<string>>();
  if (workspaceIds.length === 0) return { names, providers };
  const rows = await db
    .select({ workspaceId: llmProfiles.workspaceId, name: llmProfiles.name, provider: llmProfiles.provider })
    .from(llmProfiles)
    .where(inArray(llmProfiles.workspaceId, workspaceIds));
  for (const row of rows) {
    names.set(row.workspaceId, (names.get(row.workspaceId) ?? new Set()).add(row.name));
    providers.set(row.workspaceId, (providers.get(row.workspaceId) ?? new Set()).add(row.provider));
  }
  return { names, providers };
}

function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
