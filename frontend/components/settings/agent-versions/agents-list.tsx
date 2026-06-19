"use client";

import { isEmpty } from "lodash";
import { ChevronRight } from "lucide-react";
import useSWR from "swr";

import { type AgentListItem } from "@/lib/actions/agents";
import { formatTimestamp, swrFetcher } from "@/lib/utils";

import { SettingsSection, SettingsSectionHeader, SettingsTable, SettingsTableRow } from "../settings-section";

interface AgentsListProps {
  projectId: string;
  onSelect: (agentId: string) => void;
}

export default function AgentsList({ projectId, onSelect }: AgentsListProps) {
  const { data, isLoading } = useSWR<AgentListItem[]>(`/api/projects/${projectId}/agents`, swrFetcher);

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title="Agent versions"
        description="Agents detected from your traces. Each agent tracks versions of its system prompt, tools, and model over time. Select an agent to see its version history."
      />
      <SettingsTable
        isLoading={isLoading}
        isEmpty={isEmpty(data)}
        emptyMessage="No agents detected yet."
        headers={["Name", "Versions", "Created", ""]}
        colSpan={4}
      >
        {data?.map((agent) => (
          <SettingsTableRow
            key={agent.id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => onSelect(agent.id)}
          >
            <td className="px-4 text-sm font-medium">{agent.name}</td>
            <td className="px-4 text-sm text-muted-foreground">{agent.versionCount}</td>
            <td className="px-4 text-sm text-muted-foreground">{formatTimestamp(agent.createdAt)}</td>
            <td className="px-4">
              <div className="flex justify-end">
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>
            </td>
          </SettingsTableRow>
        ))}
      </SettingsTable>
    </SettingsSection>
  );
}
