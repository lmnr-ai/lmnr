import { parseAsStringLiteral, useQueryState } from "nuqs";
import useSWR from "swr";

import {
  GITHUB_CONNECT_STATUSES,
  type GithubIntegrationInfo,
  type ProjectGithubRepo,
} from "@/lib/actions/github/types";
import { swrFetcher, withBasePath } from "@/lib/utils";

export function useGithubIntegration(workspaceId: string | null | undefined) {
  return useSWR<GithubIntegrationInfo | null>(workspaceId ? `/api/workspaces/${workspaceId}/github` : null, swrFetcher);
}

export function useProjectGithubRepo(projectId: string | null | undefined, enabled = true) {
  return useSWR<ProjectGithubRepo | null>(
    projectId && enabled ? `/api/projects/${projectId}/github/repo` : null,
    swrFetcher
  );
}

export function useGithubConnectStatus() {
  return useQueryState("github", parseAsStringLiteral(GITHUB_CONNECT_STATUSES));
}

// The callback appends ?github=<status> to returnTo.
export function githubInstallHref(projectId: string, returnTo: string) {
  return withBasePath(`/api/integrations/github/install?${new URLSearchParams({ projectId, returnTo })}`);
}
