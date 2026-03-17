"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Calendar } from "lucide-react";
import Link from "next/link";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import SignalSparkline from "@/components/signals/signal-sparkline.tsx";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type SignalRow } from "@/lib/actions/signals";
import { type SignalSparklineData } from "@/lib/actions/signals/stats";
import { formatShortDate } from "@/lib/utils.ts";

function truncatePrompt(prompt: string, maxLen: number): string {
  if (!prompt) return "";
  if (prompt.length <= maxLen) return prompt;
  return prompt.slice(0, maxLen).trimEnd() + "...";
}

export default function SignalCard({
  signal,
  projectId,
  sparklineData,
  sparklineMaxCount,
  isSelected,
  onToggleSelect,
}: {
  signal: SignalRow;
  projectId: string;
  sparklineData: SignalSparklineData;
  sparklineMaxCount?: number;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const data = sparklineData[signal.id] ?? [];
  const signalUrl = `/project/${projectId}/signals/${signal.id}`;

  return (
    <Card className="hover:border-primary/40 transition-colors h-full relative">
      <CardHeader className="px-3 pt-3 pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {/* stopPropagation prevents checkbox clicks from triggering card navigation */}
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} aria-label={`Select ${signal.name}`} />
            </div>
            <Link href={signalUrl} className="truncate">
              <h3 className="font-medium text-sm truncate hover:underline">{signal.name}</h3>
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pt-0 pb-2 space-y-2 cursor-pointer">
        <Link href={signalUrl} className="block space-y-2">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-xs text-muted-foreground line-clamp-2">{truncatePrompt(signal.prompt, 100)}</p>
              </TooltipTrigger>
              {signal.prompt && (
                <TooltipPrimitive.Portal>
                  <TooltipContent side="bottom" align="start" className="max-w-[350px] border">
                    <p className="text-muted-foreground whitespace-pre-wrap">{signal.prompt}</p>
                  </TooltipContent>
                </TooltipPrimitive.Portal>
              )}
            </Tooltip>
          </TooltipProvider>
          <div className="grid grid-cols-3 gap-1.5">
            <div className="flex flex-col items-center p-1.5 rounded-md bg-secondary/50">
              <span className="flex-1 flex flex-col justify-center text-base font-semibold">{signal.eventsCount}</span>
              <span className="text-[10px] text-muted-foreground">Events</span>
            </div>
            <div className="flex flex-col items-center p-1.5 rounded-md bg-secondary/50">
              <span className="flex-1 flex flex-col justify-center text-base font-semibold">
                {signal.clustersCount}
              </span>
              <span className="text-[10px] text-muted-foreground">Clusters</span>
            </div>
            <div className="flex flex-col items-center p-1.5 rounded-md bg-secondary/50">
              <span
                title={signal?.lastEventAt ?? "-"}
                className="flex-1 flex flex-col justify-center text-sm font-medium"
              >
                <ClientTimestampFormatter timestamp={signal?.lastEventAt ?? "-"} />
              </span>
              <span className="text-[10px] text-muted-foreground">Last event</span>
            </div>
          </div>
          <div className="h-[36px] w-full">
            <SignalSparkline data={data} maxCount={sparklineMaxCount} />
          </div>
        </Link>
      </CardContent>
      <CardFooter className="px-3 pb-3 pt-0 flex items-center justify-between text-[10px] text-muted-foreground">
        <div title={signal.createdAt} className="flex items-center gap-1">
          <Calendar className="size-3" />
          Created {formatShortDate(signal.createdAt)}
        </div>
      </CardFooter>
    </Card>
  );
}
