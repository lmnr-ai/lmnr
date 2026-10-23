"use client";

import { format } from "date-fns";

import { Progress } from "@/components/ui/progress";
import { type AgentProgress as AgentProgressData } from "@/lib/actions/agents";

interface AgentProgressProps {
  progress: AgentProgressData;
}

const progressLabel = ({ countingFrom, traces, needed, maxWaitMinutes }: AgentProgressData): string => {
  if (new Date(countingFrom) > new Date()) return `Counting traces from ${format(new Date(countingFrom), "HH:mm")}`;
  if (traces < needed) return `${traces} / ${needed} traces`;
  return `First version within ${maxWaitMinutes} min`;
};

export default function AgentProgress({ progress }: AgentProgressProps) {
  const counted = Math.min(progress.traces, progress.needed);

  return (
    <div className="flex flex-col gap-3 rounded-md border p-6 text-sm">
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium">Waiting for the first version</span>
        <span className="text-muted-foreground">{progressLabel(progress)}</span>
      </div>
      <Progress value={(counted / progress.needed) * 100} className="h-1.5" />
      <p className="text-muted-foreground">
        The first version is created once {progress.needed} traces start more than {progress.rolloutWindowMinutes}{" "}
        minutes after the agent&apos;s first trace, so a deploy still rolling out is never taken for a version.
      </p>
    </div>
  );
}
