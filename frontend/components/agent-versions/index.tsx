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
  const [agentId, setAgentId] = useQueryState("agentId", parseAsString.withOptions({ history: "push" }));
  const { data: agents, isLoading } = useSWR<AgentListItem[]>(`/api/projects/${projectId}/agents`, swrFetcher);

  const selectedId = agentId ?? agents?.[0]?.id ?? null;

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Header is OUTSIDE the nested provider so its SidebarTrigger toggles the main project sidebar. */}
      <Header path="agent versions" />
      <SidebarProvider defaultOpen>
        <div className="flex flex-1 overflow-hidden">
          <AgentsSidebar agents={agents} isLoading={isLoading} selectedId={selectedId} onSelect={setAgentId} />
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-8 px-6 pb-24">
              {selectedId ? (
                <AgentVersionsList projectId={projectId} agentId={selectedId} />
              ) : (
                !isLoading && (
                  <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
                    No agents detected yet.
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
