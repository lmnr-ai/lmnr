"use client";

import { isEmpty, times } from "lodash";
import { ArrowLeft } from "lucide-react";
import useSWR from "swr";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type AgentVersionsResult } from "@/lib/actions/agents";
import { swrFetcher } from "@/lib/utils";

import RenameAgentDialog from "./rename-agent-dialog";
import { agentDisplayName } from "./utils";
import VersionCard from "./version-card";

interface AgentVersionsListProps {
  projectId: string;
  agentId: string;
  onBack: () => void;
}

export default function AgentVersionsList({ projectId, agentId, onBack }: AgentVersionsListProps) {
  const { data, isLoading, mutate } = useSWR<AgentVersionsResult>(
    `/api/projects/${projectId}/agents/${agentId}/versions`,
    swrFetcher
  );

  const versions = data?.versions ?? [];

  return (
    <SettingsSection>
      <Button variant="ghost" className="w-fit -ml-2 h-7 text-muted-foreground" onClick={onBack}>
        <ArrowLeft data-icon="inline-start" className="size-4 mr-1" />
        All agents
      </Button>
      <div className="flex items-start justify-between gap-4">
        <SettingsSectionHeader
          title={data ? agentDisplayName(data.agent.name) : "Agent versions"}
          description="A new version starts when the stable part of the agent's system prompt or tools changes. Details that differ on every call, like user names or dates, are ignored. Models are tracked per version."
        />
        {data && (
          <RenameAgentDialog
            projectId={projectId}
            agentId={agentId}
            currentName={agentDisplayName(data.agent.name)}
            onRenamed={() => mutate()}
          />
        )}
      </div>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {times(3, (i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isEmpty(versions) ? (
        <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
          No versions found for this agent.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {versions.map((version, i) => (
            <VersionCard key={version.id} version={version} previous={versions[i + 1]} isLatest={i === 0} />
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
