"use client";

import { isEmpty, times } from "lodash";
import { ArrowLeft } from "lucide-react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type AgentVersionsResult } from "@/lib/actions/agents";
import { swrFetcher } from "@/lib/utils";

import { SettingsSection, SettingsSectionHeader } from "../settings-section";
import VersionCard from "./version-card";

interface AgentVersionsListProps {
  projectId: string;
  agentId: string;
  onBack: () => void;
}

export default function AgentVersionsList({ projectId, agentId, onBack }: AgentVersionsListProps) {
  const { data, isLoading } = useSWR<AgentVersionsResult>(
    `/api/projects/${projectId}/agents/${agentId}/versions`,
    swrFetcher
  );

  const versions = data?.versions ?? [];

  return (
    <SettingsSection>
      <Button variant="ghost" className="w-fit -ml-2 h-7 text-muted-foreground" onClick={onBack}>
        <ArrowLeft className="size-4 mr-1" />
        All agents
      </Button>
      <SettingsSectionHeader
        title={data?.agent.name ?? "Agent versions"}
        description="Track changes between versions of your agent based on system prompt, tools, and model."
      />
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
            <VersionCard
              key={version.versionHash}
              version={version}
              previous={versions[i + 1]}
              versionNumber={versions.length - i}
              isLatest={i === 0}
            />
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
