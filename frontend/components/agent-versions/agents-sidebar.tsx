"use client";

import { isEmpty, times } from "lodash";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSectionLabel,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { type AgentListItem } from "@/lib/actions/agents";

import { agentDisplayName } from "./utils";

interface AgentsSidebarProps {
  projectId: string;
  agents: AgentListItem[];
  isLoading: boolean;
  selectedId?: string;
}

export default function AgentsSidebar({ projectId, agents, isLoading, selectedId }: AgentsSidebarProps) {
  const searchParams = useSearchParams();

  // Keeps the chart's range params across agents.
  const agentHref = (agentId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("agentId", agentId);
    return `/project/${projectId}/agent-versions?${params.toString()}`;
  };

  return (
    <Sidebar collapsible="none" className="w-72">
      <SidebarContent className="bg-background pl-2">
        <SidebarGroup className="pt-0">
          <SidebarSectionLabel>Agents</SidebarSectionLabel>
          {isLoading ? (
            <div className="flex flex-col gap-0.5">
              {times(4, (i) => (
                <Skeleton key={i} className="h-[30px] w-full" />
              ))}
            </div>
          ) : isEmpty(agents) ? (
            <p className="px-2 text-xs text-muted-foreground">No agents detected yet.</p>
          ) : (
            <SidebarMenu className="gap-0.5">
              {agents.map((agent) => (
                <SidebarMenuItem className="h-[30px]" key={agent.id}>
                  <SidebarMenuButton asChild className="h-[30px] pr-3" isActive={agent.id === selectedId}>
                    <Link href={agentHref(agent.id)}>
                      <span className="truncate">{agentDisplayName(agent.name)}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                        {agent.versionCount}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          )}
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
