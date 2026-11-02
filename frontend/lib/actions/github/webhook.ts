import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { cache } from "@/lib/cache";
import { db } from "@/lib/db/drizzle";
import { githubIntegrations, projectGithubRepos } from "@/lib/db/migrations/schema";
import { INSTALLATION_REPOS_CACHE_KEY } from "@/lib/github/client";

const DELIVERY_TTL_SECONDS = 24 * 60 * 60;

const InstallationEventSchema = z.object({
  action: z.string(),
  installation: z.object({ id: z.number() }),
});

const InstallationRepositoriesEventSchema = InstallationEventSchema.extend({
  repositories_removed: z.array(z.object({ id: z.number() })).optional(),
});

const RepositoryEventSchema = InstallationEventSchema.extend({
  repository: z.object({ id: z.number(), full_name: z.string() }),
});

const DELIVERY_KEY = (deliveryId: string) => `github_delivery:${deliveryId}`;

// Marked only after success, so a redelivery of a failed event (same delivery ID) still runs.
export async function isDeliveryHandled(deliveryId: string): Promise<boolean> {
  return cache.exists(DELIVERY_KEY(deliveryId));
}

export async function markDeliveryHandled(deliveryId: string): Promise<void> {
  await cache.set(DELIVERY_KEY(deliveryId), true, { expireAfterSeconds: DELIVERY_TTL_SECONDS });
}

async function deleteRepoLinks(installationId: number, repoIds: number[]) {
  if (repoIds.length === 0) return;
  const [integration] = await db
    .select({ id: githubIntegrations.id })
    .from(githubIntegrations)
    .where(eq(githubIntegrations.installationId, installationId))
    .limit(1);
  if (!integration) return;
  await db
    .delete(projectGithubRepos)
    .where(and(eq(projectGithubRepos.integrationId, integration.id), inArray(projectGithubRepos.repoId, repoIds)));
}

// installation.created is ignored: linking happens only in the connect callback, which knows the workspace.
export async function handleGithubWebhook(event: string, payload: unknown): Promise<void> {
  if (event === "installation") {
    const { action, installation } = InstallationEventSchema.parse(payload);
    const byInstallation = eq(githubIntegrations.installationId, installation.id);
    if (action === "deleted") {
      await db.delete(githubIntegrations).where(byInstallation);
    } else if (action === "suspend") {
      await db.update(githubIntegrations).set({ suspendedAt: new Date().toISOString() }).where(byInstallation);
    } else if (action === "unsuspend") {
      await db.update(githubIntegrations).set({ suspendedAt: null }).where(byInstallation);
    }
    return;
  }

  if (event === "installation_repositories") {
    const { installation, repositories_removed } = InstallationRepositoriesEventSchema.parse(payload);
    await cache.remove(INSTALLATION_REPOS_CACHE_KEY(installation.id));
    await deleteRepoLinks(
      installation.id,
      (repositories_removed ?? []).map((r) => r.id)
    );
    return;
  }

  if (event === "repository") {
    const { action, installation, repository } = RepositoryEventSchema.parse(payload);
    if (action === "renamed" || action === "transferred") {
      await db
        .update(projectGithubRepos)
        .set({ repoFullName: repository.full_name })
        .where(eq(projectGithubRepos.repoId, repository.id));
    } else if (action === "deleted") {
      await deleteRepoLinks(installation.id, [repository.id]);
    }
    await cache.remove(INSTALLATION_REPOS_CACHE_KEY(installation.id));
  }
}
