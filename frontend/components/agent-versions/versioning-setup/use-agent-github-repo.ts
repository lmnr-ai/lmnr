import useSWR from "swr";

import { type AgentGithubRepo } from "@/lib/actions/agents";
import { fetchApi } from "@/lib/api/fetch-api";

// The route exists only where the GitHub integration does; a 404 hides the step.
const fetcher = async (url: string): Promise<AgentGithubRepo | null> => {
  const { data, error, status } = await fetchApi<AgentGithubRepo>(url);
  if (status === 404) return null;
  if (error !== null) throw new Error(error);
  return data;
};

/** `undefined` while loading, `null` when GitHub isn't available in this deployment. */
export function useAgentGithubRepo(projectId: string, agentId: string) {
  const { data } = useSWR(`/api/projects/${projectId}/github/agents/${agentId}/repo`, fetcher, {
    revalidateOnFocus: false,
  });
  return data;
}
