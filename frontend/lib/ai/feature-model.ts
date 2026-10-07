import type { LanguageModel } from "ai";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { LlmProfileConfigSchema } from "@/lib/actions/llm-profiles/schema";
import { decryptSecrets } from "@/lib/actions/llm-profiles/secrets";
import { db } from "@/lib/db/drizzle";
import { llmFeatureRoutes, llmProfiles, projects } from "@/lib/db/migrations/schema";

import { DEFAULT_LLM_FEATURE_ID, LLM_FEATURE_ENV_TIER, type LlmFeature } from "./features";
import { envLanguageModel } from "./model";
import { languageModelFromProfile } from "./profile-model";

/**
 * The model a frontend LLM feature runs on. Mirrors `LlmProfileStore::resolve_feature`
 * in the app-server: the project's workspace rows first (the feature, then
 * `default`), then the global (`workspace_id IS NULL`) rows in the same order,
 * then the env-configured provider at the feature's tier. Without a
 * `projectId` only the global rows apply.
 *
 * Route lookup errors propagate: a database blip must not silently reroute a
 * workspace's traffic to the env provider.
 */
export const getLanguageModel = async (feature: LlmFeature, projectId?: string): Promise<LanguageModel> => {
  const route = await resolveFeatureRoute(feature, projectId);
  if (route) {
    return languageModelFromProfile(route.profile, route.secrets, route.model);
  }
  return envLanguageModel(LLM_FEATURE_ENV_TIER[feature]);
};

const resolveFeatureRoute = async (feature: LlmFeature, projectId?: string) => {
  const scope = projectId
    ? or(
        isNull(llmFeatureRoutes.workspaceId),
        inArray(
          llmFeatureRoutes.workspaceId,
          db.select({ workspaceId: projects.workspaceId }).from(projects).where(eq(projects.id, projectId))
        )
      )
    : isNull(llmFeatureRoutes.workspaceId);

  const [row] = await db
    .select({
      profileId: llmProfiles.id,
      provider: llmProfiles.provider,
      config: llmProfiles.config,
      secrets: llmProfiles.secrets,
      model: llmFeatureRoutes.modelName,
    })
    .from(llmFeatureRoutes)
    .innerJoin(llmProfiles, eq(llmProfiles.id, llmFeatureRoutes.llmProfileId))
    .where(and(inArray(llmFeatureRoutes.featureId, [feature, DEFAULT_LLM_FEATURE_ID]), scope))
    // Workspace rows before global rows, the feature's own row before `default`.
    .orderBy(
      asc(sql`${llmFeatureRoutes.workspaceId} IS NULL`),
      asc(sql`${llmFeatureRoutes.featureId} = ${DEFAULT_LLM_FEATURE_ID}`)
    )
    .limit(1);

  if (!row) return null;

  return {
    profile: LlmProfileConfigSchema.parse({ provider: row.provider, config: row.config }),
    secrets: await decryptSecrets(row.profileId, row.secrets),
    model: row.model,
  };
};
