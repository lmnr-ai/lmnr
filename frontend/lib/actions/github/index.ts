import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { db } from "@/lib/db/drizzle";
import { githubIntegrations, projectGithubRepos, projects } from "@/lib/db/migrations/schema";
import { deleteInstallation, getInstallationRepo, type GitHubRepo, listInstallationRepos } from "@/lib/github/client";

import { type GithubIntegrationInfo, type GithubRepoOption, type ProjectGithubRepo } from "./types";

export * from "./types";

const MAX_REPO_RESULTS = 50;

const LinkRepoSchema = z.object({
  projectId: z.guid(),
  repoId: z.number().int().positive(),
});

export async function getGithubIntegration(workspaceId: string) {
  const [row] = await db
    .select()
    .from(githubIntegrations)
    .where(eq(githubIntegrations.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

export async function getGithubIntegrationInfo(workspaceId: string): Promise<GithubIntegrationInfo | null> {
  const row = await getGithubIntegration(workspaceId);
  if (!row) return null;
  return {
    installationId: row.installationId,
    accountLogin: row.accountLogin,
    accountType: row.accountType,
    suspended: row.suspendedAt !== null,
  };
}

export async function getProjectWorkspaceId(projectId: string): Promise<string | null> {
  const [row] = await db
    .select({ workspaceId: projects.workspaceId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row?.workspaceId ?? null;
}

async function requireProjectIntegration(projectId: string) {
  const workspaceId = await getProjectWorkspaceId(projectId);
  const integration = workspaceId ? await getGithubIntegration(workspaceId) : null;
  if (!integration) {
    throw new Error("GitHub is not connected to this workspace.");
  }
  return integration;
}

export async function getProjectGithubRepo(projectId: string): Promise<ProjectGithubRepo | null> {
  const [row] = await db
    .select({
      repoId: projectGithubRepos.repoId,
      repoFullName: projectGithubRepos.repoFullName,
      defaultBranch: projectGithubRepos.defaultBranch,
    })
    .from(projectGithubRepos)
    .where(eq(projectGithubRepos.projectId, projectId))
    .limit(1);
  return row ?? null;
}

// Callers must have verified the installation belongs to the session user (see the callback route).
export async function saveGithubInstallation(input: {
  workspaceId: string;
  userId: string;
  installationId: number;
  account: { id: number; login: string; type: string };
}): Promise<"connected" | "taken"> {
  const { workspaceId, userId, installationId, account } = input;

  const [existing] = await db
    .select({ workspaceId: githubIntegrations.workspaceId, installationId: githubIntegrations.installationId })
    .from(githubIntegrations)
    .where(eq(githubIntegrations.installationId, installationId))
    .limit(1);
  if (existing) {
    return existing.workspaceId === workspaceId ? "connected" : "taken";
  }

  const current = await getGithubIntegration(workspaceId);
  if (current) {
    // One workspace, one GitHub account: switching accounts goes through Disconnect.
    return "taken";
  }

  const inserted = await db
    .insert(githubIntegrations)
    .values({
      workspaceId,
      installationId,
      accountId: account.id,
      accountLogin: account.login,
      accountType: account.type,
      createdBy: userId,
    })
    .onConflictDoNothing()
    .returning({ id: githubIntegrations.id });
  return inserted.length > 0 ? "connected" : "taken";
}

async function saveProjectRepo(projectId: string, integrationId: string, repo: GitHubRepo) {
  const values = {
    integrationId,
    repoId: repo.id,
    repoFullName: repo.full_name,
    defaultBranch: repo.default_branch,
  };
  await db
    .insert(projectGithubRepos)
    .values({ projectId, ...values })
    .onConflictDoUpdate({ target: projectGithubRepos.projectId, set: values });
}

// Finishes the one-step flow when there is nothing to pick.
export async function autoLinkSingleRepo(projectId: string): Promise<void> {
  if (await getProjectGithubRepo(projectId)) return;
  const integration = await requireProjectIntegration(projectId);
  const repos = await listInstallationRepos(integration.installationId);
  if (repos.length === 1) {
    await saveProjectRepo(projectId, integration.id, repos[0]);
  }
}

export async function searchProjectRepoOptions(projectId: string, query: string): Promise<GithubRepoOption[]> {
  const integration = await requireProjectIntegration(projectId);
  const repos = await listInstallationRepos(integration.installationId);
  const q = query.trim().toLowerCase();
  return repos
    .filter((r) => !q || r.full_name.toLowerCase().includes(q))
    .slice(0, MAX_REPO_RESULTS)
    .map((r) => ({ id: r.id, fullName: r.full_name, private: r.private }));
}

export async function linkProjectRepo(input: z.infer<typeof LinkRepoSchema>): Promise<ProjectGithubRepo> {
  const { projectId, repoId } = LinkRepoSchema.parse(input);
  const integration = await requireProjectIntegration(projectId);
  const repo = await getInstallationRepo(integration.installationId, repoId);
  if (!repo) {
    throw new Error("This repository isn't available to the Laminar GitHub App.");
  }
  await saveProjectRepo(projectId, integration.id, repo);
  return { repoId: repo.id, repoFullName: repo.full_name, defaultBranch: repo.default_branch };
}

export async function unlinkProjectRepo(projectId: string): Promise<void> {
  await db.delete(projectGithubRepos).where(eq(projectGithubRepos.projectId, projectId));
}

export async function disconnectGithub(workspaceId: string): Promise<void> {
  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin"] });
  const integration = await getGithubIntegration(workspaceId);
  if (!integration) return;
  await deleteInstallation(integration.installationId);
  await db.delete(githubIntegrations).where(eq(githubIntegrations.id, integration.id));
}
