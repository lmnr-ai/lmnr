"use client";

import { type AgentProgress as AgentProgressData } from "@/lib/actions/agents";

interface AgentProgressProps {
  progress: AgentProgressData;
}

export default function AgentProgress({ progress }: AgentProgressProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border p-4 text-sm text-muted-foreground">
      <span>
        It takes around {progress.needed} traces and {progress.maxWaitMinutes} minutes for the first version to be
        created.
      </span>
      <span className="shrink-0 font-medium text-foreground tabular-nums">
        {Math.min(progress.traces, progress.needed)}/{progress.needed}
      </span>
    </div>
  );
}
