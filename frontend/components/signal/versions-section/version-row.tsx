"use client";

import { versionColor } from "@/components/agent-versions/utils";
import { CardExpandIndicator } from "@/components/ui/card-expand-indicator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn, formatRelativeTime } from "@/lib/utils";

import { type ChangelogEntry } from "./changelog";
import VersionDetails from "./version-details";

interface Props {
  signalId: string;
  entry: ChangelogEntry;
  isLatest: boolean;
  isLast: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** One version on the timeline: a pill on the throughline, and a collapsible summary of what changed. */
export default function VersionRow({ signalId, entry, isLatest, isLast, open, onOpenChange }: Props) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} id={`signal-version-${entry.version}`} className="flex gap-3">
      <div className="flex w-10 flex-shrink-0 flex-col items-center">
        {/* Segments butt against the pill so the throughline stays continuous across rows. */}
        <div className={cn("h-2 w-px bg-border", isLatest && "invisible")} />
        <span
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            isLatest ? "bg-emphasis-3 text-foreground" : "bg-emphasis-1 text-secondary-foreground"
          )}
        >
          <span className="size-1.5 rounded-full" style={{ backgroundColor: versionColor(signalId, entry.version) }} />v
          {entry.version}
        </span>
        {!isLast && <div className="w-px flex-1 bg-border" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pb-6">
        <CollapsibleTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            className="group flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-emphasis-1 active:bg-emphasis-2"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cn("text-sm font-medium", !open && "truncate")}>{entry.summary}</span>
              <span className="text-xs text-muted-foreground">{formatRelativeTime(entry.createdAt)}</span>
            </div>
            <CardExpandIndicator expanded={open} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
          <VersionDetails entry={entry} />
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
