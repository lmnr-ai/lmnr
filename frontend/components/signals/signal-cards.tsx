"use client";

import { Calendar, Clock, Loader2, Radio, Zap } from "lucide-react";
import Link from "next/link";
import React from "react";

import SignalSparkline from "@/components/signals/signal-sparkline.tsx";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { type SignalRow } from "@/lib/actions/signals";
import { type SignalSparklineData } from "@/lib/actions/signals/stats";
import { cn } from "@/lib/utils";

export type CardVariant = 1 | 2 | 3 | 4 | 5;

interface SignalCardsProps {
  signals: SignalRow[];
  projectId: string;
  sparklineData: SignalSparklineData;
  sparklineMaxCount?: number;
  variant: CardVariant;
  isLoading?: boolean;
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

function getActivityLevel(eventsCount: number, lastEventAt: string | null): "high" | "medium" | "low" | "none" {
  if (eventsCount === 0 || !lastEventAt) return "none";
  const hoursSinceLastEvent = (Date.now() - new Date(lastEventAt).getTime()) / (1000 * 60 * 60);
  if (hoursSinceLastEvent < 1 && eventsCount > 10) return "high";
  if (hoursSinceLastEvent < 24) return "medium";
  if (hoursSinceLastEvent < 72) return "low";
  return "none";
}

function parseSchemaFields(prompt: string): string[] {
  // Extract keywords from the prompt to show as topic tags
  const keywords: string[] = [];
  const lowerPrompt = prompt.toLowerCase();

  const topicMap: Record<string, string> = {
    failure: "Failure Detection",
    error: "Error Analysis",
    logic: "Logic Analysis",
    reasoning: "Reasoning",
    task: "Task Evaluation",
    success: "Success Check",
    friction: "UX Friction",
    frustration: "Frustration",
    safety: "Safety",
    unsafe: "Safety Monitor",
    hallucin: "Hallucination",
    intent: "Intent Classification",
    classify: "Classification",
    quality: "Quality",
    cost: "Cost Analysis",
    anomal: "Anomaly Detection",
    security: "Security",
    performance: "Performance",
  };

  for (const [keyword, label] of Object.entries(topicMap)) {
    if (lowerPrompt.includes(keyword)) {
      keywords.push(label);
    }
  }

  return keywords.length > 0 ? keywords.slice(0, 3) : ["Custom Signal"];
}

function truncatePrompt(prompt: string, maxLen: number): string {
  if (!prompt) return "";
  if (prompt.length <= maxLen) return prompt;
  return prompt.slice(0, maxLen).trimEnd() + "...";
}

// ─── Variant 1: Compact Stats Card ──────────────────────────────────────────
// Clean card with signal name, brief prompt preview, key stats as numbers,
// and relative time for last event. Quick at-a-glance status overview.
function CompactStatsCard({ signal, projectId }: { signal: SignalRow; projectId: string }) {
  return (
    <Link href={`/project/${projectId}/signals/${signal.id}`}>
      <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-sm truncate">{signal.name}</h3>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatRelativeTime(signal.lastEventAt)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{truncatePrompt(signal.prompt, 120)}</p>
        </CardHeader>
        <CardFooter className="p-4 pt-2 flex gap-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Zap className="size-3" />
            <span className="font-medium text-foreground">{signal.eventsCount}</span>
            <span>events</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Radio className="size-3" />
            <span className="font-medium text-foreground">{signal.triggersCount}</span>
            <span>triggers</span>
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}

// ─── Variant 2: Sparkline Activity Card ─────────────────────────────────────
// Card featuring a prominent activity sparkline chart, signal name,
// events count, and last event time. Activity-first view.
function SparklineCard({
  signal,
  projectId,
  sparklineData,
  sparklineMaxCount,
}: {
  signal: SignalRow;
  projectId: string;
  sparklineData: SignalSparklineData;
  sparklineMaxCount?: number;
}) {
  const data = sparklineData[signal.id] ?? [];

  return (
    <Link href={`/project/${projectId}/signals/${signal.id}`}>
      <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm truncate">{signal.name}</h3>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {signal.eventsCount} events
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="h-[48px] w-full">
            <SignalSparkline data={data} maxCount={sparklineMaxCount} />
          </div>
        </CardContent>
        <CardFooter className="p-4 pt-0 flex justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Radio className="size-3" />
            <span>{signal.triggersCount} triggers</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="size-3" />
            <span>{formatRelativeTime(signal.lastEventAt)}</span>
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}

// ─── Variant 3: Topic Tags Card ─────────────────────────────────────────────
// Shows the signal name, inferred topic tags from the prompt as badges,
// trigger count, and events count. Emphasizes *what* the signal evaluates.
function TopicTagsCard({ signal, projectId }: { signal: SignalRow; projectId: string }) {
  const tags = parseSchemaFields(signal.prompt);

  return (
    <Link href={`/project/${projectId}/signals/${signal.id}`}>
      <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full">
        <CardHeader className="p-4 pb-3">
          <h3 className="font-medium text-sm">{signal.name}</h3>
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px] font-normal px-1.5 py-0">
                {tag}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <p className="text-xs text-muted-foreground line-clamp-2">{truncatePrompt(signal.prompt, 100)}</p>
        </CardContent>
        <CardFooter className="p-4 pt-0 flex items-center justify-between">
          <div className="flex gap-3">
            <div className="flex items-center gap-1 text-xs">
              <Zap className="size-3 text-primary" />
              <span className="font-medium">{signal.eventsCount}</span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <Radio className="size-3 text-muted-foreground" />
              <span className="font-medium">{signal.triggersCount}</span>
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground">Created {formatDate(signal.createdAt)}</span>
        </CardFooter>
      </Card>
    </Link>
  );
}

// ─── Variant 4: Status Dashboard Card ───────────────────────────────────────
// Larger card with signal name, prompt excerpt, a color-coded activity
// indicator, events/triggers as metrics, and creation date.
function StatusDashboardCard({
  signal,
  projectId,
  sparklineData,
  sparklineMaxCount,
}: {
  signal: SignalRow;
  projectId: string;
  sparklineData: SignalSparklineData;
  sparklineMaxCount?: number;
}) {
  const activityLevel = getActivityLevel(signal.eventsCount, signal.lastEventAt);
  const data = sparklineData[signal.id] ?? [];

  const activityConfig = {
    high: { label: "Active", color: "bg-success", textColor: "text-success" },
    medium: { label: "Recent", color: "bg-primary", textColor: "text-primary" },
    low: { label: "Quiet", color: "bg-muted-foreground", textColor: "text-muted-foreground" },
    none: { label: "Inactive", color: "bg-muted-foreground/50", textColor: "text-muted-foreground" },
  };

  const activity = activityConfig[activityLevel];

  return (
    <Link href={`/project/${projectId}/signals/${signal.id}`}>
      <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className={cn("size-2 rounded-full shrink-0", activity.color)} />
              <h3 className="font-medium text-sm truncate">{signal.name}</h3>
            </div>
            <span className={cn("text-[10px] whitespace-nowrap", activity.textColor)}>{activity.label}</span>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          <p className="text-xs text-muted-foreground line-clamp-2">{truncatePrompt(signal.prompt, 100)}</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center p-2 rounded-md bg-secondary/50">
              <span className="text-lg font-semibold">{signal.eventsCount}</span>
              <span className="text-[10px] text-muted-foreground">Events</span>
            </div>
            <div className="flex flex-col items-center p-2 rounded-md bg-secondary/50">
              <span className="text-lg font-semibold">{signal.triggersCount}</span>
              <span className="text-[10px] text-muted-foreground">Triggers</span>
            </div>
            <div className="flex flex-col items-center p-2 rounded-md bg-secondary/50">
              <span className="text-sm font-medium mt-1">{formatRelativeTime(signal.lastEventAt)}</span>
              <span className="text-[10px] text-muted-foreground">Last event</span>
            </div>
          </div>
          <div className="h-[40px] w-full">
            <SignalSparkline data={data} maxCount={sparklineMaxCount} />
          </div>
        </CardContent>
        <CardFooter className="p-4 pt-0 flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="size-3" />
            Created {formatDate(signal.createdAt)}
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}

// ─── Variant 5: Minimal Horizontal Card ─────────────────────────────────────
// Slim horizontal card (like a styled row) with name, prompt preview,
// key metrics inline, and sparkline. Middle-ground between table and card.
function MinimalHorizontalCard({
  signal,
  projectId,
  sparklineData,
  sparklineMaxCount,
}: {
  signal: SignalRow;
  projectId: string;
  sparklineData: SignalSparklineData;
  sparklineMaxCount?: number;
}) {
  const data = sparklineData[signal.id] ?? [];
  const tags = parseSchemaFields(signal.prompt);
  const activityLevel = getActivityLevel(signal.eventsCount, signal.lastEventAt);

  const dotColor = {
    high: "bg-success",
    medium: "bg-primary",
    low: "bg-muted-foreground",
    none: "bg-muted-foreground/50",
  };

  return (
    <Link href={`/project/${projectId}/signals/${signal.id}`} className="block">
      <Card className="hover:border-primary/40 transition-colors cursor-pointer">
        <div className="flex items-center gap-4 p-3">
          {/* Status dot + Name */}
          <div className="flex items-center gap-2 min-w-[180px] max-w-[220px]">
            <div className={cn("size-2 rounded-full shrink-0", dotColor[activityLevel])} />
            <span className="text-sm font-medium truncate">{signal.name}</span>
          </div>

          {/* Prompt preview */}
          <p className="text-xs text-muted-foreground truncate flex-1 min-w-0">{truncatePrompt(signal.prompt, 80)}</p>

          {/* Tags */}
          <div className="hidden xl:flex items-center gap-1 shrink-0">
            {tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px] font-normal px-1.5 py-0 whitespace-nowrap">
                {tag}
              </Badge>
            ))}
          </div>

          {/* Sparkline */}
          <div className="w-[120px] shrink-0 hidden lg:block">
            <SignalSparkline data={data} maxCount={sparklineMaxCount} />
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Zap className="size-3" />
              <span className="font-medium text-foreground">{signal.eventsCount}</span>
            </div>
            <div className="flex items-center gap-1">
              <Radio className="size-3" />
              <span className="font-medium text-foreground">{signal.triggersCount}</span>
            </div>
            <span className="text-xs whitespace-nowrap">{formatRelativeTime(signal.lastEventAt)}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

// ─── Main SignalCards Component ──────────────────────────────────────────────
export default function SignalCards({
  signals,
  projectId,
  sparklineData,
  sparklineMaxCount,
  variant,
  isLoading,
}: SignalCardsProps) {
  if (isLoading) {
    return (
      <div className="flex flex-1 justify-center py-12">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="flex flex-1 justify-center py-12">
        <div className="flex flex-col gap-2 items-center max-w-md">
          <h3 className="text-base font-medium text-secondary-foreground">No signals yet</h3>
          <p className="text-sm text-muted-foreground text-center">
            Signals let you track outcomes, behaviors, and failures in your traces using LLM-based evaluation. Click +
            Signal above to get started.
          </p>
        </div>
      </div>
    );
  }

  if (variant === 5) {
    // Horizontal variant uses a single column layout
    return (
      <div className="flex flex-col gap-2">
        {signals.map((signal) => (
          <MinimalHorizontalCard
            key={signal.id}
            signal={signal}
            projectId={projectId}
            sparklineData={sparklineData}
            sparklineMaxCount={sparklineMaxCount}
          />
        ))}
      </div>
    );
  }

  // Grid layout for card variants 1-4
  const gridCols =
    variant === 4
      ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  return (
    <div className={cn("grid gap-3", gridCols)}>
      {signals.map((signal) => {
        switch (variant) {
          case 1:
            return <CompactStatsCard key={signal.id} signal={signal} projectId={projectId} />;
          case 2:
            return (
              <SparklineCard
                key={signal.id}
                signal={signal}
                projectId={projectId}
                sparklineData={sparklineData}
                sparklineMaxCount={sparklineMaxCount}
              />
            );
          case 3:
            return <TopicTagsCard key={signal.id} signal={signal} projectId={projectId} />;
          case 4:
            return (
              <StatusDashboardCard
                key={signal.id}
                signal={signal}
                projectId={projectId}
                sparklineData={sparklineData}
                sparklineMaxCount={sparklineMaxCount}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
