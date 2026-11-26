"use client";

import { isEmpty, times } from "lodash";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { Skeleton } from "@/components/ui/skeleton";
import { type AgentVersionsResult } from "@/lib/actions/agents";
import { swrFetcher } from "@/lib/api/fetch-api";

import AgentDefinition from "./agent-definition";
import RenameAgentDialog from "./rename-agent-dialog";
import { agentDisplayName } from "./utils";
import VersionCard from "./version-card";
import VersionTraces from "./version-traces";
import SetupPill, { useSetupSteps } from "./versioning-setup";

interface AgentVersionsListProps {
  projectId: string;
  agentId: string;
  /** The agents list shows names and version counts. */
  onAgentChanged: () => void;
  initialVersions?: AgentVersionsResult;
}

export default function AgentVersionsList({
  projectId,
  agentId,
  onAgentChanged,
  initialVersions,
}: AgentVersionsListProps) {
  const { data, isLoading, mutate } = useSWR<AgentVersionsResult>(
    `/api/projects/${projectId}/agents/${agentId}/versions`,
    swrFetcher,
    { fallbackData: initialVersions }
  );

  const setup = useSetupSteps(projectId, agentId, data?.agent.releaseMode ?? false);
  const { mutate: mutateKeys } = useSWRConfig();

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const versions = data?.versions ?? [];

  // A deleted version's traces move to another one in the chart too.
  const onVersionDeleted = () => {
    setExpandedId(null);
    mutate();
    onAgentChanged();
    mutateKeys(
      (key) => typeof key === "string" && key.startsWith(`/api/projects/${projectId}/agents/${agentId}/traces-stats`)
    );
  };

  return (
    <SettingsSection>
      <div className="flex items-center justify-start gap-3">
        <SettingsSectionHeader title={data ? agentDisplayName(data.agent.name) : "Agent versions"} />
        {data && (
          <>
            <RenameAgentDialog
              projectId={projectId}
              agentId={agentId}
              currentName={agentDisplayName(data.agent.name)}
              onRenamed={() => {
                mutate();
                onAgentChanged();
              }}
            />
            <SetupPill setup={setup} />
          </>
        )}
      </div>
      {data && (
        <AgentDefinition
          projectId={projectId}
          agentId={agentId}
          definition={data.agent.definition}
          onChange={() => mutate()}
        />
      )}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {times(3, (i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isEmpty(versions) ? (
        <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
          It takes around 50 traces and 10 minutes for the first version to be created.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <VersionTraces projectId={projectId} agentId={agentId} versions={versions} />
          <div className="flex flex-col">
            {versions.map((version, i) => (
              <VersionCard
                key={version.id}
                projectId={projectId}
                agentId={agentId}
                version={version}
                previous={versions[i + 1]}
                isLatest={i === 0}
                isLast={i === versions.length - 1}
                open={version.id === expandedId}
                onOpenChange={(open) => setExpandedId(open ? version.id : null)}
                onDeleted={version.versionNumber > 1 ? onVersionDeleted : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
