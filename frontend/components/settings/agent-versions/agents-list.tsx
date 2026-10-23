"use client";

import { isEmpty } from "lodash";
import { ChevronRight } from "lucide-react";
import useSWR from "swr";

import { type AgentListItem } from "@/lib/actions/agents";
import { formatTimestamp, swrFetcher } from "@/lib/utils";

import { SettingsSection, SettingsSectionHeader, SettingsTable, SettingsTableRow } from "../settings-section";
import AgentProgress from "./agent-progress";
import { agentDisplayName } from "./utils";

interface AgentsListProps {
  projectId: string;
  onSelect: (agentId: string) => void;
}

export default function AgentsList({ projectId, onSelect }: AgentsListProps) {
  // Refreshed while an agent waits for its first version, so its progress keeps up.
  const { data, isLoading } = useSWR<AgentListItem[]>(`/api/projects/${projectId}/agents`, swrFetcher, {
    refreshInterval: (latest) => (latest?.some((agent) => agent.progress) ? 30_000 : 0),
  });

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title="Agent versions"
        description="Agents detected from your traces. Each agent tracks versions of its system prompt and tools, and the models each version ran on. Select an agent to see its version history."
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
            className="cursor-pointer hover:overlay-hover"
            onClick={() => onSelect(agent.id)}
          >
            <td className="px-4 text-sm">
              <span className="font-medium">{agentDisplayName(agent.name)}</span>
            </td>
            <td className="px-4 text-sm text-muted-foreground">
              {agent.progress ? <AgentProgress progress={agent.progress} /> : agent.versionCount}
            </td>
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
