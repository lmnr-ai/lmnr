"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";

import Header from "@/components/ui/header";
import { type AgentGroup as AgentGroupType } from "@/lib/actions/task-sets/types";
import { swrFetcher } from "@/lib/api/fetch-api";

import AgentGroup from "./agent-group";
import EmptyState from "./empty-state";

/** Every task set of the project, grouped by the agent it belongs to. */
export default function TaskSets() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data, error, isLoading, mutate } = useSWR<AgentGroupType[]>(
    `/api/projects/${projectId}/task-sets`,
    swrFetcher
  );

  return (
    <>
      <Header path="task sets" />
      <div className="flex flex-1 flex-col gap-6 overflow-auto px-4 pb-4">
        {error && (
          <div className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load task sets"}
          </div>
        )}
        {isLoading && <div className="text-sm text-secondary-foreground">Loading task sets…</div>}
        {data?.length === 0 && <EmptyState />}
        {data?.map((agent) => (
          <AgentGroup key={agent.id} projectId={projectId} agent={agent} onChanged={() => mutate()} />
        ))}
      </div>
    </>
  );
}
