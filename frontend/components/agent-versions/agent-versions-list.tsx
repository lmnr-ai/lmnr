"use client";

import { isEmpty, times } from "lodash";
import { useRef } from "react";
import useSWR from "swr";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { Skeleton } from "@/components/ui/skeleton";
import { type AgentVersionsResult } from "@/lib/actions/agents";
import { swrFetcher } from "@/lib/utils";

import RenameAgentDialog from "./rename-agent-dialog";
import { useTracesRangeQuery } from "./use-traces-range-query";
import { agentDisplayName } from "./utils";
import VersionCard from "./version-card";
import VersionTracesChart from "./version-traces-chart";

interface AgentVersionsListProps {
  projectId: string;
  agentId: string;
}

export default function AgentVersionsList({ projectId, agentId }: AgentVersionsListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rangeQuery = useTracesRangeQuery(containerRef);
  const { data, isLoading, mutate } = useSWR<AgentVersionsResult>(
    `/api/projects/${projectId}/agents/${agentId}/versions?${rangeQuery}`,
    swrFetcher,
    { keepPreviousData: true }
  );

  const versions = data?.versions ?? [];

  return (
    <div ref={containerRef}>
      <SettingsSection>
        <div className="flex items-center justify-start gap-3">
          <SettingsSectionHeader title={data ? agentDisplayName(data.agent.name) : "Agent versions"} />
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
          <div className="flex flex-col gap-6">
            {data?.traces && <VersionTracesChart versions={versions} data={data.traces} />}
            <div className="flex flex-col">
              {versions.map((version, i) => (
                <VersionCard
                  key={version.id}
                  version={version}
                  previous={versions[i + 1]}
                  isLatest={i === 0}
                  isLast={i === versions.length - 1}
                />
              ))}
            </div>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
