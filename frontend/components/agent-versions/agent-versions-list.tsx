"use client";

import { isEmpty, times } from "lodash";
import { useState } from "react";
import useSWR from "swr";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { Skeleton } from "@/components/ui/skeleton";
import { type AgentVersionsResult } from "@/lib/actions/agents";
import { swrFetcher } from "@/lib/utils";

import RenameAgentDialog from "./rename-agent-dialog";
import { agentDisplayName } from "./utils";
import VersionCard from "./version-card";
import VersionTraces from "./version-traces";
import VersioningSetup from "./versioning-setup";

interface AgentVersionsListProps {
  projectId: string;
  agentId: string;
  onRenamed: () => void;
  initialVersions?: AgentVersionsResult;
}

export default function AgentVersionsList({ projectId, agentId, onRenamed, initialVersions }: AgentVersionsListProps) {
  const { data, isLoading, mutate } = useSWR<AgentVersionsResult>(
    `/api/projects/${projectId}/agents/${agentId}/versions`,
    swrFetcher,
    { fallbackData: initialVersions }
  );

  // `undefined` until the user toggles a version, so the latest one starts open.
  const [openId, setOpenId] = useState<string | null>();

  const versions = data?.versions ?? [];
  const expandedId = openId === undefined ? versions[0]?.id : openId;

  return (
    <SettingsSection>
      <div className="flex items-center justify-start gap-3">
        <SettingsSectionHeader title={data ? agentDisplayName(data.agent.name) : "Agent versions"} />
        {data && (
          <RenameAgentDialog
            projectId={projectId}
            agentId={agentId}
            currentName={agentDisplayName(data.agent.name)}
            onRenamed={() => {
              mutate();
              onRenamed();
            }}
          />
        )}
      </div>
      {data && <VersioningSetup projectId={projectId} releaseMode={data.agent.releaseMode} />}
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
                agentId={agentId}
                version={version}
                previous={versions[i + 1]}
                isLatest={i === 0}
                isLast={i === versions.length - 1}
                open={version.id === expandedId}
                onOpenChange={(open) => setOpenId(open ? version.id : null)}
              />
            ))}
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
