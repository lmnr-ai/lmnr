"use client";

import { useParams } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import useSWR from "swr";

import Header from "@/components/ui/header";
import { SidebarProvider } from "@/components/ui/sidebar";
import { type AgentListItem } from "@/lib/actions/agents";
import { swrFetcher } from "@/lib/utils";

import AgentVersionsList from "./agent-versions-list";
import AgentsSidebar from "./agents-sidebar";

export default function AgentVersions() {
  const { projectId } = useParams<{ projectId: string }>();
  const [agentId] = useQueryState("agentId", parseAsString);
  const { data, isLoading, mutate } = useSWR<AgentListItem[]>(`/api/projects/${projectId}/agents`, swrFetcher);

  const agents = data ?? [];
  // Without a valid agentId in the URL, show the first agent: the list is sorted by version count.
  const selected = agents.find((agent) => agent.id === agentId) ?? agents[0];

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Header is OUTSIDE the nested provider so its SidebarTrigger toggles the main project sidebar. */}
      <Header path="agent versions" />
      <SidebarProvider defaultOpen>
        <div className="flex flex-1 overflow-hidden">
          <AgentsSidebar projectId={projectId} agents={agents} isLoading={isLoading} selectedId={selected?.id} />
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-8 px-6 pb-24">
              {selected ? (
                <AgentVersionsList
                  key={selected.id}
                  projectId={projectId}
                  agentId={selected.id}
                  onRenamed={() => mutate()}
                />
              ) : (
                !isLoading && (
                  <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
                    Agents are detected from your traces. Each agent tracks versions of its system prompt and tools, and
                    the models each version ran on.
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}
