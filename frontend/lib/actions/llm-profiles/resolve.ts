import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { llmProfileModels, llmProfiles, projects } from "@/lib/db/migrations/schema";
import { NotFoundError } from "@/lib/errors";

import { type LlmProfileConfig, LlmProfileConfigSchema, type LlmProfileSecrets } from "./schema";
import { decryptSecrets } from "./secrets";

const ResolveProjectLlmProfileSchema = z.object({
  projectId: z.guid(),
  profileId: z.guid(),
  model: z.string().trim().min(1).max(256),
});

export type ResolvedLlmProfile = {
  id: string;
  name: string;
  profile: LlmProfileConfig;
  secrets: LlmProfileSecrets;
  model: string;
};

/**
 * Loads a profile for a server-side call on the project's behalf: the profile
 * must belong to the project's workspace and list `model`. Secrets come back
 * decrypted, so the result must never reach a client.
 */
export async function resolveProjectLlmProfile(
  input: z.infer<typeof ResolveProjectLlmProfileSchema>
): Promise<ResolvedLlmProfile> {
  const { projectId, profileId, model } = ResolveProjectLlmProfileSchema.parse(input);

  const [row] = await db
    .select({
      id: llmProfiles.id,
      name: llmProfiles.name,
      provider: llmProfiles.provider,
      config: llmProfiles.config,
      secrets: llmProfiles.secrets,
      model: llmProfileModels.name,
    })
    .from(llmProfiles)
    .innerJoin(projects, and(eq(projects.workspaceId, llmProfiles.workspaceId), eq(projects.id, projectId)))
    .leftJoin(llmProfileModels, and(eq(llmProfileModels.profileId, llmProfiles.id), eq(llmProfileModels.name, model)))
    .where(eq(llmProfiles.id, profileId))
    .limit(1);

  if (!row) throw new NotFoundError("LLM profile not found in this workspace");
  if (!row.model) throw new NotFoundError(`Model "${model}" is not listed in LLM profile "${row.name}"`);

  return {
    id: row.id,
    name: row.name,
    profile: LlmProfileConfigSchema.parse({ provider: row.provider, config: row.config }),
    secrets: await decryptSecrets(row.id, row.secrets),
    model,
  };
}
