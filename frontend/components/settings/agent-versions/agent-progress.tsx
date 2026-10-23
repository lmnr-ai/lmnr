"use client";

import { format } from "date-fns";

import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex w-fit flex-col gap-1">
            <span>{progressLabel(progress)}</span>
            <Progress value={(counted / progress.needed) * 100} className="h-1 w-32" />
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent className="max-w-xs">
            The first version is created once {progress.needed} traces start more than {progress.rolloutWindowMinutes}{" "}
            minutes after the agent&apos;s first trace, so a deploy still rolling out is never taken for a version.
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}
