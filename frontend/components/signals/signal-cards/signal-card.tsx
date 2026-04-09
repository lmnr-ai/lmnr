"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { isNil } from "lodash";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";

import SignalSparkline from "@/components/signals/signal-sparkline.tsx";
import { DEFAULT_SIGNAL_COLOR } from "@/components/signals/utils";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type SignalRow } from "@/lib/actions/signals";
import { type SignalSparklineData } from "@/lib/actions/signals/stats";
import { formatRelativeTime, formatShortDate } from "@/lib/utils.ts";

export default function SignalCard({
  signal,
  projectId,
  sparklineData,
  sparklineMaxCount,
  onEdit,
  onDelete,
}: {
  signal: SignalRow;
  projectId: string;
  sparklineData: SignalSparklineData;
  sparklineMaxCount?: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const data = sparklineData[signal.id];
  const isSparklineLoading = isNil(data);
  const signalUrl = `/project/${projectId}/signals/${signal.id}`;

  return (
    <Link href={signalUrl} className="block h-full">
      <Card className="hover:border-primary/40 transition-colors h-full">
        <CardHeader className="px-3 pt-3 pb-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="size-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: signal.color ?? DEFAULT_SIGNAL_COLOR }}
              />
              <h3 className="font-medium text-sm truncate">{signal.name}</h3>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-secondary flex-shrink-0"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  aria-label={`Actions for ${signal.name}`}
                >
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="px-3 pt-0 pb-2 space-y-2">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2lh]">{signal.prompt}</p>
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
                {formatRelativeTime(signal.lastEventAt)}
              </span>
              <span className="text-[10px] text-muted-foreground">Last event</span>
            </div>
          </div>
          <div className="h-[36px] w-full">
            <SignalSparkline data={data ?? []} maxCount={sparklineMaxCount} isLoading={isSparklineLoading} />
          </div>
        </CardContent>
        <CardFooter className="px-3 pb-3 pt-0 flex items-center justify-between text-[10px] text-muted-foreground">
          <div title={signal.createdAt}>Created {formatShortDate(signal.createdAt)}</div>
        </CardFooter>
      </Card>
    </Link>
  );
}
