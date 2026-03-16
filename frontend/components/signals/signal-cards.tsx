"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Calendar } from "lucide-react";
import Link from "next/link";
import React from "react";

import SignalSparkline from "@/components/signals/signal-sparkline.tsx";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type SignalRow } from "@/lib/actions/signals";
import { type SignalSparklineData } from "@/lib/actions/signals/stats";

interface SignalCardsProps {
  signals: SignalRow[];
  projectId: string;
  sparklineData: SignalSparklineData;
  sparklineMaxCount?: number;
  selectedIds: Record<string, boolean>;
  onSelectionChange: (ids: Record<string, boolean>) => void;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function truncatePrompt(prompt: string, maxLen: number): string {
  if (!prompt) return "";
  if (prompt.length <= maxLen) return prompt;
  return prompt.slice(0, maxLen).trimEnd() + "...";
}

function SignalCard({
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

  return (
    <Card className="hover:border-primary/40 transition-colors h-full relative">
      <CardHeader className="px-3 pt-3 pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} aria-label={`Select ${signal.name}`} />
            <Link href={`/project/${projectId}/signals/${signal.id}`} className="truncate">
              <h3 className="font-medium text-sm truncate hover:underline">{signal.name}</h3>
            </Link>
          </div>
        </div>
      </CardHeader>
      <Link href={`/project/${projectId}/signals/${signal.id}`}>
        <CardContent className="px-3 pt-0 pb-2 space-y-2 cursor-pointer">
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
              <span className="flex-1 flex flex-col justify-center text-sm font-medium">
                {formatRelativeTime(signal.lastEventAt)}
              </span>
              <span className="text-[10px] text-muted-foreground">Last event</span>
            </div>
          </div>
          <div className="h-[36px] w-full">
            <SignalSparkline data={data} maxCount={sparklineMaxCount} />
          </div>
        </CardContent>
        <CardFooter className="px-3 pb-3 pt-0 flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="size-3" />
            Created {formatDate(signal.createdAt)}
          </div>
        </CardFooter>
      </Link>
    </Card>
  );
}

export default function SignalCards({
  signals,
  projectId,
  sparklineData,
  sparklineMaxCount,
  selectedIds,
  onSelectionChange,
}: SignalCardsProps) {
  const toggleSelect = (id: string) => {
    const next = { ...selectedIds };
    if (next[id]) {
      delete next[id];
    } else {
      next[id] = true;
    }
    onSelectionChange(next);
  };

  return (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {signals.map((signal) => (
        <SignalCard
          key={signal.id}
          signal={signal}
          projectId={projectId}
          sparklineData={sparklineData}
          sparklineMaxCount={sparklineMaxCount}
          isSelected={!!selectedIds[signal.id]}
          onToggleSelect={() => toggleSelect(signal.id)}
        />
      ))}
    </div>
  );
}
