import { asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { db } from "@/lib/db/drizzle";
import { llmProfileModels, llmProfiles, projects } from "@/lib/db/migrations/schema";
import { type WorkspaceRole } from "@/lib/workspaces/types";

import { callAppServer } from "./app-server";
import {
  LLM_PROFILE_PROVIDERS,
  type LlmProfile,
  type LlmProfileConfig,
  LlmProfileConfigSchema,
  secretsPresence,
} from "./schema";
import { decryptSecrets } from "./secrets";

/** Any workspace member may read and write profiles; there is no role gate. */
const MEMBER_ROLES: WorkspaceRole[] = ["member", "admin", "owner"];

const ListLlmProfilesSchema = z.object({ workspaceId: z.guid() });

// Shape only; the app-server validates contents and returns 400 with the message.
const DraftSchema = z.object({
  name: z.string().optional(),
  profile: z.object({ provider: z.enum(LLM_PROFILE_PROVIDERS), config: z.record(z.string(), z.unknown()) }).optional(),
  secrets: z.record(z.string(), z.unknown()).optional(),
  models: z.array(z.string()).optional(),
});

const CreateLlmProfileSchema = DraftSchema.extend({ workspaceId: z.guid() });

const UpdateLlmProfileSchema = DraftSchema.extend({ workspaceId: z.guid(), profileId: z.guid() });

const DeleteLlmProfileSchema = z.object({ workspaceId: z.guid(), profileId: z.guid() });

const ListProjectLlmProfilesSchema = z.object({ projectId: z.guid() });

export type CreateLlmProfileInput = z.infer<typeof CreateLlmProfileSchema>;
export type UpdateLlmProfileInput = z.infer<typeof UpdateLlmProfileSchema>;

type ProfileRow = typeof llmProfiles.$inferSelect;

async function toLlmProfile(row: ProfileRow, models: string[]): Promise<LlmProfile> {
  const parsed = LlmProfileConfigSchema.parse({ provider: row.provider, config: row.config });
  const decrypted = await decryptSecrets(row.id, row.secrets);
  return {
    ...parsed,
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    models,
    secrets: secretsPresence(decrypted),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadModels(profileIds: string[]): Promise<Map<string, string[]>> {
  const models = new Map<string, string[]>();
  if (profileIds.length === 0) return models;
  const rows = await db
    .select({ profileId: llmProfileModels.profileId, name: llmProfileModels.name })
    .from(llmProfileModels)
    .where(inArray(llmProfileModels.profileId, profileIds))
    .orderBy(asc(llmProfileModels.createdAt), asc(llmProfileModels.name));
  for (const row of rows) {
    models.set(row.profileId, [...(models.get(row.profileId) ?? []), row.name]);
  }
  return models;
}

export async function listLlmProfiles(input: z.infer<typeof ListLlmProfilesSchema>): Promise<LlmProfile[]> {
  const { workspaceId } = ListLlmProfilesSchema.parse(input);
  await checkUserWorkspaceRole({ workspaceId, roles: MEMBER_ROLES });

  const rows = await db
    .select()
    .from(llmProfiles)
    .where(eq(llmProfiles.workspaceId, workspaceId))
    .orderBy(sql`lower(${llmProfiles.name})`, llmProfiles.name);

  const models = await loadModels(rows.map((r) => r.id));
  return Promise.all(rows.map((row) => toLlmProfile(row, models.get(row.id) ?? [])));
}

export type LlmProfileOption = {
  id: string;
  name: string;
  provider: LlmProfileConfig["provider"];
  models: string[];
};

/** The picker payload for the signal form: no config, no secrets, no role check beyond project access. */
export async function listProjectLlmProfileOptions(
  input: z.infer<typeof ListProjectLlmProfilesSchema>
): Promise<LlmProfileOption[]> {
  const { projectId } = ListProjectLlmProfilesSchema.parse(input);

  const rows = await db
    .select({ id: llmProfiles.id, name: llmProfiles.name, provider: llmProfiles.provider })
    .from(llmProfiles)
    .innerJoin(projects, eq(projects.workspaceId, llmProfiles.workspaceId))
    .where(eq(projects.id, projectId))
    .orderBy(sql`lower(${llmProfiles.name})`, llmProfiles.name);

  const models = await loadModels(rows.map((r) => r.id));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    provider: row.provider as LlmProfileConfig["provider"],
    models: models.get(row.id) ?? [],
  }));
}

/** Flattens the form's `{ profile: { provider, config } }` into the app-server's body. */
function toAppServerBody({ name, profile, secrets, models }: z.infer<typeof DraftSchema>) {
  return { name, provider: profile?.provider, config: profile?.config, secrets, models };
}

// Writes live in the app-server (`llm/profiles/service/`): validation,
// secret merge/prune, encryption and cache invalidation happen there so the
// frontend, project-API and CLI surfaces cannot drift.

export async function createLlmProfile(input: CreateLlmProfileInput): Promise<LlmProfile> {
  const { workspaceId, ...draft } = CreateLlmProfileSchema.parse(input);
  await checkUserWorkspaceRole({ workspaceId, roles: MEMBER_ROLES });
  return callAppServer<LlmProfile>(`/workspaces/${workspaceId}/llm-profiles`, {
    method: "POST",
    body: toAppServerBody(draft),
  });
}

export async function updateLlmProfile(input: UpdateLlmProfileInput): Promise<LlmProfile> {
  const { workspaceId, profileId, ...draft } = UpdateLlmProfileSchema.parse(input);
  await checkUserWorkspaceRole({ workspaceId, roles: MEMBER_ROLES });
  return callAppServer<LlmProfile>(`/workspaces/${workspaceId}/llm-profiles/${profileId}`, {
    method: "PATCH",
    body: toAppServerBody(draft),
  });
}

export async function deleteLlmProfile(input: z.infer<typeof DeleteLlmProfileSchema>): Promise<LlmProfile> {
  const { workspaceId, profileId } = DeleteLlmProfileSchema.parse(input);
  await checkUserWorkspaceRole({ workspaceId, roles: MEMBER_ROLES });
  return callAppServer<LlmProfile>(`/workspaces/${workspaceId}/llm-profiles/${profileId}`, { method: "DELETE" });
}
