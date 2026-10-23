"use client";

import { times } from "lodash";

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
  agents?: AgentListItem[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (agentId: string) => void;
}

export default function AgentsSidebar({ agents, isLoading, selectedId, onSelect }: AgentsSidebarProps) {
  return (
    <Sidebar collapsible="none" className="w-72">
      <SidebarContent className="bg-background pl-2">
        <SidebarGroup className="pt-0">
          <SidebarSectionLabel>Agents</SidebarSectionLabel>
          <SidebarMenu className="gap-0.5">
            {isLoading
              ? times(4, (i) => <Skeleton key={i} className="h-[30px] w-full" />)
              : agents?.map((agent) => (
                  <SidebarMenuItem className="h-[30px]" key={agent.id}>
                    <SidebarMenuButton
                      className="h-[30px] pr-3"
                      isActive={selectedId === agent.id}
                      tooltip={agentDisplayName(agent.name)}
                      onClick={() => onSelect(agent.id)}
                    >
                      <span className="truncate">{agentDisplayName(agent.name)}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{agent.versionCount}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
