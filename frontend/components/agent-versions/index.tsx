"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";

import Header from "@/components/ui/header";
import { SidebarProvider } from "@/components/ui/sidebar";
import { type AgentListItem, type AgentVersionsResult } from "@/lib/actions/agents";
import { swrFetcher } from "@/lib/utils";

import AgentVersionsList from "./agent-versions-list";
import AgentsSidebar from "./agents-sidebar";

export default function AgentVersions({
  agentId,
  initialVersions,
}: {
  agentId?: string;
  initialVersions?: AgentVersionsResult;
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<AgentListItem[]>(`/api/projects/${projectId}/agents`, swrFetcher);

  const agents = data ?? [];
  const firstAgentId = agents[0]?.id;
  const selectedAgentId = agentId ?? firstAgentId;

  useEffect(() => {
    if (!agentId && firstAgentId) {
      router.replace(`/project/${projectId}/agent-versions/${firstAgentId}`);
    }
  }, [agentId, firstAgentId, projectId, router]);
  return (
    <div className="flex flex-col h-full gap-2">
      {/* Header is OUTSIDE the nested provider so its SidebarTrigger toggles the main project sidebar. */}
      <Header path="agent versions" />
      <SidebarProvider defaultOpen>
        <div className="flex flex-1 overflow-hidden">
          <AgentsSidebar projectId={projectId} agents={agents} isLoading={isLoading} selectedId={selectedAgentId} />
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-8 px-6 pb-24">
              {selectedAgentId ? (
                <AgentVersionsList
                  key={selectedAgentId}
                  projectId={projectId}
                  agentId={selectedAgentId}
                  initialVersions={initialVersions}
                  onRenamed={() => mutate()}
                />
              ) : (
                !isLoading &&
                agents.length === 0 && (
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
