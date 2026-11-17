"use client";

import ArchiveFolder from "@/components/evaluation/task-files/archive-folder";
import Message from "@/components/evaluation/task-files/message";
import { CopyButton } from "@/components/ui/copy-button";
import { type AgentScriptsInfo } from "@/lib/actions/task-sets/types";
import { formatTimestamp } from "@/lib/utils";

interface AgentScriptsProps {
  projectId: string;
  agentId: string;
  agentName: string;
  /** The scripts the agent's last run used. */
  scripts: AgentScriptsInfo | null;
}

/**
 * The agent's scripts (its `evals/<agent>/` folder minus `task_sets/`) as its
 * last run used them. They belong in the user's repo: Laminar only keeps the
 * copies runs used, so this offers the command that restores them there.
 */
export default function AgentScripts({ projectId, agentId, agentName, scripts }: AgentScriptsProps) {
  if (!scripts) {
    return (
      <Message>{`No run has used scripts for this agent yet. They live in your repo, in evals/${agentName}/.`}</Message>
    );
  }

  const files = `/api/projects/${projectId}/eval-agents/${agentId}/versions/${scripts.id}/files`;
  const pullCommand = `npx lmnr-cli eval pull ${agentName}`;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-3 border-b px-3 py-2 text-xs text-secondary-foreground">
        <span>Used by the last run {formatTimestamp(scripts.lastUsedAt)}</span>
        {scripts.gitSha && <span className="font-mono">git {scripts.gitSha.slice(0, 10)}</span>}
        <span className="ml-auto">Commit these to your repo:</span>
        <code className="font-mono">{pullCommand}</code>
        <CopyButton
          size="icon"
          variant="ghost"
          className="-ml-2 h-6 w-6"
          iconClassName="h-3.5 w-3.5"
          text={pullCommand}
        />
      </div>
      <div className="flex min-h-0 flex-1">
        <ArchiveFolder
          key={scripts.id}
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
