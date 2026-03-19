"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import NextLink from "next/link";
import { useParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type TraceSignal } from "@/lib/traces/types";

interface SignalsCellProps {
  signals?: TraceSignal[];
}

export default function SignalsCell({ signals }: SignalsCellProps) {
  const { projectId } = useParams();

  if (!signals || signals.length === 0) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="truncate">
            <Badge className="rounded-3xl" variant="outline">
              <span>
                {signals.length} {signals.length === 1 ? "signal" : "signals"}
              </span>
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="bottom" className="p-2 border max-w-sm">
            <div className="flex flex-col gap-1">
              {signals.map((signal) => (
                <NextLink
                  key={signal.eventId}
                  href={`/project/${projectId}/signals/${signal.signalId}?eventId=${signal.eventId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="block"
                >
                  <Badge className="rounded-3xl cursor-pointer hover:bg-accent" variant="outline">
                    <span>{signal.signalName}</span>
                  </Badge>
                </NextLink>
              ))}
            </div>
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}
