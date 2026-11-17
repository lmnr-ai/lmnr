"use client";

import { useState } from "react";
import useSWR from "swr";

import ArchiveFolder from "@/components/evaluation/task-files/archive-folder";
import Message from "@/components/evaluation/task-files/message";
import { CopyButton } from "@/components/ui/copy-button";
import { type AgentVersionInfo } from "@/lib/actions/task-sets/types";
import { swrFetcher } from "@/lib/api/fetch-api";

import VersionSelect from "./version-select";

interface AgentScriptsProps {
  projectId: string;
  agentId: string;
  agentName: string;
  /** Shown first; the newest version when the agent has no head. */
  headVersionId: string | null;
}

/**
 * The agent's scripts (its `evals/<agent>/` folder minus `task_sets/`) at one
 * version: the head by default, any pushed version or run snapshot on pick.
 */
export default function AgentScripts({ projectId, agentId, agentName, headVersionId }: AgentScriptsProps) {
  const base = `/api/projects/${projectId}/eval-agents/${agentId}/versions`;
  const { data: versions, error } = useSWR<AgentVersionInfo[]>(base, swrFetcher);
  const [picked, setPicked] = useState<string | null>(null);
  const versionId = picked ?? headVersionId ?? versions?.[0]?.id ?? null;
  const version = versions?.find((v) => v.id === versionId);

  if (error) return <Message>{error instanceof Error ? error.message : "Failed to load agent scripts"}</Message>;
  if (!versions) return <Message>Loading agent scripts…</Message>;
  if (!versionId) return <Message>No agent scripts were uploaded for this agent yet.</Message>;

  const files = `${base}/${versionId}/files`;
  const pullCommand = `npx lmnr-cli eval pull ${agentName}`;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-3 border-b px-3 py-2 text-xs text-secondary-foreground">
        <VersionSelect versions={versions} value={versionId} headVersionId={headVersionId} onChange={setPicked} />
        {version?.gitSha && <span className="font-mono">git {version.gitSha.slice(0, 10)}</span>}
        {headVersionId && (
          <>
            <span className="ml-auto">Get the latest into your repo:</span>
            <code className="font-mono">{pullCommand}</code>
            <CopyButton
              size="icon"
              variant="ghost"
              className="-ml-2 h-6 w-6"
              iconClassName="h-3.5 w-3.5"
              text={pullCommand}
            />
          </>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <ArchiveFolder
          key={versionId}
          id="agent-scripts"
          listUrl={files}
          contentUrl={(path) => `${files}/content?path=${encodeURIComponent(path)}`}
          root=""
          title={agentName}
          defaultFile="agent.yaml"
        />
      </div>
    </div>
  );
}
