"use client";

import { CardExpandIndicator } from "@/components/ui/card-expand-indicator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { type AgentVersionItem } from "@/lib/actions/agents";
import { cn, formatRelativeTime } from "@/lib/utils";

import ChangeSummary from "./change-summary";
import { versionColor, versionTitle } from "./utils";
import VersionDetails from "./version-details";
import VersionSource from "./version-source";

interface VersionCardProps {
  agentId: string;
  version: AgentVersionItem;
  previous?: AgentVersionItem;
  isLatest: boolean;
  isLast: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function VersionCard({
  agentId,
  version,
  previous,
  isLatest,
  isLast,
  open,
  onOpenChange,
}: VersionCardProps) {
  const promptChanged = previous ? version.systemPrompt !== previous.systemPrompt : false;
  const toolsChanged = previous ? version.toolDefinitions !== previous.toolDefinitions : false;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="flex gap-3">
      <div className="flex w-10 flex-shrink-0 flex-col items-center">
        {/* Segments butt against the pill so the throughline stays continuous across rows. */}
        <div className={cn("h-2 w-px bg-border", isLatest && "invisible")} />
        <span
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            isLatest ? "bg-emphasis-3 text-foreground" : "bg-emphasis-1 text-secondary-foreground"
          )}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: versionColor(agentId, version.versionNumber) }}
          />
          v{version.versionNumber}
        </span>
        {!isLast && <div className="w-px flex-1 bg-border" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col pb-6">
        <CollapsibleTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            className="group flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-emphasis-1 active:bg-emphasis-2 transition-colors"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <ChangeSummary segments={versionTitle(version, previous)} className={cn(!open && "truncate")} />
              <span className="text-xs text-muted-foreground">{formatRelativeTime(version.createdAt)}</span>
            </div>
            <CardExpandIndicator expanded={open} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
          {/* Spacing lives inside the animated content so it opens with it rather than jumping. */}
          <div className="pt-2">
            <VersionDetails
              version={version}
              previous={previous}
              promptChanged={promptChanged}
              toolsChanged={toolsChanged}
            />
          </div>
        </CollapsibleContent>
        {version.source && <VersionSource source={version.source} />}
      </div>
    </Collapsible>
  );
}
