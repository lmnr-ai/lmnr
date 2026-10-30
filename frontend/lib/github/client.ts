import jwt from "jsonwebtoken";
import { z } from "zod/v4";

import { cache } from "@/lib/cache";
import { githubAppConfig } from "@/lib/github/config";

const API_URL = "https://api.github.com";
const PER_PAGE = 100;
// Installation tokens live 1 hour; refresh ahead of expiry.
const INSTALLATION_TOKEN_CACHE_TTL_SECONDS = 55 * 60;
const INSTALLATION_TOKEN_CACHE_KEY = (installationId: number) => `github_installation_token:${installationId}`;
// "All repositories" installs can list thousands of repos, and the picker searches on every keystroke.
const INSTALLATION_REPOS_CACHE_TTL_SECONDS = 120;
export const INSTALLATION_REPOS_CACHE_KEY = (installationId: number) => `github_installation_repos:${installationId}`;

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

const AccountSchema = z.object({
  id: z.number(),
  login: z.string(),
  type: z.string(),
});

const InstallationSchema = z.object({
  id: z.number(),
  account: AccountSchema,
});

export const RepoSchema = z.object({
  id: z.number(),
  full_name: z.string(),
  default_branch: z.string(),
  private: z.boolean(),
});
export type GitHubRepo = z.infer<typeof RepoSchema>;

const InstallationTokenSchema = z.object({
  token: z.string(),
  repositories: z.array(RepoSchema).optional(),
});

export type InstallationPermissions = Partial<
  Record<"contents" | "pull_requests" | "metadata" | "checks" | "actions", "read" | "write">
>;

// RS256 app JWT. iat is backdated for clock drift; GitHub rejects exp more than 10 minutes out.
export function createAppJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ iat: now - 60, exp: now + 9 * 60, iss: githubAppConfig.clientId() }, githubAppConfig.privateKey(), {
    algorithm: "RS256",
  });
}

async function githubFetch(path: string, init: { token: string; method?: string; body?: unknown }): Promise<Response> {
  const res = await fetch(path.startsWith("https://") ? path : `${API_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${init.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "laminar",
      ...(init.body !== undefined && { "Content-Type": "application/json" }),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const message = await res
      .json()
      .then((d) => d?.message)
      .catch(() => null);
    throw new GitHubApiError(`GitHub ${init.method ?? "GET"} ${path} failed: ${message ?? res.statusText}`, res.status);
  }
  return res;
}

export async function githubRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init: { token: string; method?: string; body?: unknown }
): Promise<T> {
  const res = await githubFetch(path, init);
  return schema.parse(await res.json());
}

async function paginate<T>(path: string, token: string, pick: (page: unknown) => T[]): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await githubFetch(`${path}${sep}per_page=${PER_PAGE}&page=${page}`, { token });
    const batch = pick(await res.json());
    items.push(...batch);
    if (batch.length < PER_PAGE) return items;
  }
}

// Unscoped tokens are cached; scoped ones (agent runs, single-repo checks) are minted fresh.
export async function createInstallationToken(
  installationId: number,
  scope?: { repositoryIds: number[]; permissions: InstallationPermissions }
): Promise<z.infer<typeof InstallationTokenSchema>> {
  if (!scope) {
    const cached = await cache.get<string>(INSTALLATION_TOKEN_CACHE_KEY(installationId)).catch(() => null);
    if (cached) return { token: cached };
  }

  const result = await githubRequest(`/app/installations/${installationId}/access_tokens`, InstallationTokenSchema, {
    token: createAppJwt(),
    method: "POST",
    body: scope ? { repository_ids: scope.repositoryIds, permissions: scope.permissions } : undefined,
  });

  if (!scope) {
    await cache
      .set(INSTALLATION_TOKEN_CACHE_KEY(installationId), result.token, {
        expireAfterSeconds: INSTALLATION_TOKEN_CACHE_TTL_SECONDS,
      })
      .catch((e) => console.error("Failed to cache GitHub installation token", e));
  }
  return result;
}

export async function listInstallationRepos(installationId: number): Promise<GitHubRepo[]> {
  const cacheKey = INSTALLATION_REPOS_CACHE_KEY(installationId);
  const cached = await cache.get<GitHubRepo[]>(cacheKey).catch(() => null);
  if (cached) return cached;

  const { token } = await createInstallationToken(installationId);
  const repos = await paginate(
    "/installation/repositories",
    token,
    (page) => z.object({ repositories: z.array(RepoSchema) }).parse(page).repositories
  );
  await cache
    .set(cacheKey, repos, { expireAfterSeconds: INSTALLATION_REPOS_CACHE_TTL_SECONDS })
    .catch((e) => console.error("Failed to cache GitHub repos", e));
  return repos;
}

// GitHub answers 422 when the repo isn't part of the installation, so this doubles as an access check.
export async function getInstallationRepo(installationId: number, repoId: number): Promise<GitHubRepo | null> {
  try {
    const { repositories } = await createInstallationToken(installationId, {
      repositoryIds: [repoId],
      permissions: { metadata: "read" },
    });
    return repositories?.find((r) => r.id === repoId) ?? null;
  } catch (e) {
    if (e instanceof GitHubApiError && (e.status === 422 || e.status === 404)) return null;
    throw e;
  }
}

export async function deleteInstallation(installationId: number): Promise<void> {
  try {
    await githubFetch(`/app/installations/${installationId}`, { token: createAppJwt(), method: "DELETE" });
  } catch (e) {
    if (e instanceof GitHubApiError && e.status === 404) return;
    throw e;
  }
}

export async function exchangeUserCode(code: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: githubAppConfig.clientId(),
      client_secret: githubAppConfig.clientSecret(),
      code,
    }),
  });
  // GitHub returns 200 with an `error` field on a bad code.
  const data = z.object({ access_token: z.string().optional(), error: z.string().optional() }).parse(await res.json());
  if (!res.ok || !data.access_token) {
    throw new GitHubApiError(`GitHub code exchange failed: ${data.error ?? res.statusText}`, res.status);
  }
  return data.access_token;
}

// The installations the user can access. The callback's installation_id is spoofable, so it is
// trusted only when it appears here.
export async function findUserInstallation(userToken: string, installationId: number) {
  const installations = await paginate(
    "/user/installations",
    userToken,
    (page) => z.object({ installations: z.array(InstallationSchema) }).parse(page).installations
  );
  return installations.find((i) => i.id === installationId) ?? null;
}

// Read-only, single-repo token for the agent harness to clone with. Expires in 1 hour.
export async function createRepoCloneToken(installationId: number, repoId: number) {
  const { token, repositories } = await createInstallationToken(installationId, {
    repositoryIds: [repoId],
    permissions: { contents: "read" },
  });
  const repo = repositories?.find((r) => r.id === repoId);
  if (!repo) {
    throw new Error("Repository is not accessible to the GitHub installation.");
  }
  return { token, cloneUrl: `https://github.com/${repo.full_name}.git`, baseBranch: repo.default_branch };
}
