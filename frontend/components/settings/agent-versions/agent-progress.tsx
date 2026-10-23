"use client";

import { Progress } from "@/components/ui/progress";
import { type AgentProgress as AgentProgressData } from "@/lib/actions/agents";

interface AgentProgressProps {
  progress: AgentProgressData;
}

export default function AgentProgress({ progress }: AgentProgressProps) {
  const counted = Math.min(progress.traces, progress.needed);

  return (
    <div className="flex flex-col gap-3 rounded-md border p-6 text-sm">
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium">Waiting for the first version</span>
        <span className="text-muted-foreground">
          {counted < progress.needed
            ? `${counted} / ${progress.needed} traces`
            : `First version within ${progress.maxWaitMinutes} min`}
        </span>
      </div>
      <Progress value={(counted / progress.needed) * 100} className="h-1.5" />
      <p className="text-muted-foreground">
        The first version is created from the agent&apos;s first {progress.needed} traces.
      </p>
    </div>
  );
}
