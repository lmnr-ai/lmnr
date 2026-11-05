import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { LLM_FEATURE_GROUPS } from "@/lib/ai/feature-groups";
import { isEnvProviderConfigured } from "@/lib/ai/model";
import { callAppServer } from "@/lib/app-server";
import { db } from "@/lib/db/drizzle";
import { llmFeatureRoutes } from "@/lib/db/migrations/schema";
import { type WorkspaceRole } from "@/lib/workspaces/types";

const MEMBER_ROLES: WorkspaceRole[] = ["member", "admin", "owner"];
/** Routes move a whole workspace's AI traffic, so only admins write them. */
const ADMIN_ROLES: WorkspaceRole[] = ["admin", "owner"];

const ListFeatureRoutesSchema = z.object({ workspaceId: z.guid() });

const SetFeatureRouteSchema = z.object({
  workspaceId: z.guid(),
  groupId: z.string().refine((id) => LLM_FEATURE_GROUPS.some((g) => g.id === id), "Unknown feature group"),
  target: z.object({ llmProfileId: z.guid(), model: z.string().trim().min(1) }).nullable(),
});

export type WorkspaceFeatureRoute = { featureId: string; llmProfileId: string; model: string };

export type WorkspaceFeatureRoutes = {
  routes: WorkspaceFeatureRoute[];
  /** Whether an unset Default falls back to env vars, or leaves AI features off. */
  envProviderConfigured: boolean;
};

export async function listWorkspaceFeatureRoutes(
  input: z.infer<typeof ListFeatureRoutesSchema>
): Promise<WorkspaceFeatureRoutes> {
  const { workspaceId } = ListFeatureRoutesSchema.parse(input);
  await checkUserWorkspaceRole({ workspaceId, roles: MEMBER_ROLES });

  const routes = await db
    .select({
      featureId: llmFeatureRoutes.featureId,
      llmProfileId: llmFeatureRoutes.llmProfileId,
      model: llmFeatureRoutes.modelName,
    })
    .from(llmFeatureRoutes)
    .where(eq(llmFeatureRoutes.workspaceId, workspaceId));

  return { routes, envProviderConfigured: isEnvProviderConfigured() };
}

/** Points every feature id of the group at one profile + model, or clears them (`target: null`). */
export async function setWorkspaceFeatureRoute(input: z.infer<typeof SetFeatureRouteSchema>): Promise<void> {
  const { workspaceId, groupId, target } = SetFeatureRouteSchema.parse(input);
  const group = LLM_FEATURE_GROUPS.find((g) => g.id === groupId)!;
  await checkUserWorkspaceRole({ workspaceId, roles: ADMIN_ROLES });

  // Writes live in the app-server (`llm/profiles/service/feature_routes.rs`), which also
  // rejects them on Cloud and drops its cached routes.
  await callAppServer<Record<string, never>>(`/workspaces/${workspaceId}/llm-feature-routes`, {
    method: "PUT",
    body: { featureIds: group.featureIds, target },
  });
}

/** Feature ids of the workspace routed to `profileId`; the app-server refuses to delete such a profile. */
export async function featureIdsUsingProfile(workspaceId: string, profileId: string): Promise<string[]> {
  const rows = await db
    .select({ featureId: llmFeatureRoutes.featureId })
    .from(llmFeatureRoutes)
    .where(and(eq(llmFeatureRoutes.workspaceId, workspaceId), eq(llmFeatureRoutes.llmProfileId, profileId)));
  return rows.map((r) => r.featureId);
}
