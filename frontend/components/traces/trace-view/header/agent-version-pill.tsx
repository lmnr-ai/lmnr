"use client";

import { GitBranch } from "lucide-react";
import useSWR from "swr";

import { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, swrFetcher } from "@/lib/utils";

export interface AgentVersion {
  agentId?: string;
  versionHash?: string;
}

/** Agent identity tagged onto trace metadata by the checkpoints consumer. */
export function parseAgentVersion(metadata?: string): AgentVersion | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    const agentId = typeof parsed.agent_id === "string" ? parsed.agent_id : undefined;
    const versionHash = typeof parsed.version_hash === "string" ? parsed.version_hash : undefined;
    if (!agentId && !versionHash) return null;
    return { agentId, versionHash };
  } catch {
    return null;
  }
}

const AgentVersionPill = ({ agent, projectId }: { agent: AgentVersion | null; projectId: string }) => {
  // Name lives in Postgres; metadata only carries the id.
  const { data } = useSWR<{ id: string; name: string }>(
    agent?.agentId ? `/api/projects/${projectId}/agents/${agent.agentId}` : null,
    swrFetcher
  );

  if (!agent) return null;

  const short = agent.versionHash ? agent.versionHash.slice(0, 8) : "unknown";
  const name = data?.name;

  return (
    <span className="flex items-center h-7">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "flex items-center h-6 text-xs px-1.5 rounded-md border bg-transparent text-muted-foreground max-w-40"
              )}
            >
              <GitBranch size={14} className="mr-1 flex-shrink-0" />
              <span className="truncate font-mono">{short}</span>
            </span>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent side="bottom" className="flex flex-col gap-0.5">
              {name && <span>Agent: {name}</span>}
              {agent.versionHash && (
                <span>
                  Version: <span className="font-mono">{short}</span>
                </span>
              )}
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
};

export default AgentVersionPill;
