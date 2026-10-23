"use client";

import SplitDiffView from "@/components/ui/diff/split-diff-view";
import { cn } from "@/lib/utils";

import { STATUS_ICONS } from "./status-icons";
import ToolRow from "./tool-row";
import { type ToolChange } from "./utils";

interface ToolChangeRowProps {
  change: ToolChange;
  oldLabel: string;
  newLabel: string;
}

export default function ToolChangeRow({ change, oldLabel, newLabel }: ToolChangeRowProps) {
  const status = STATUS_ICONS[change.status];

  return (
    <ToolRow
      name={change.name}
      badge={
        status && <status.icon className={cn("size-3.5 flex-shrink-0", status.className)} aria-label={change.status} />
      }
      meta={
        <>
          {change.additions > 0 && <span className="text-success">+{change.additions}</span>}
          {change.deletions > 0 && <span className="text-destructive">−{change.deletions}</span>}
        </>
      }
    >
      <div className="overflow-hidden rounded-md border bg-emphasis-0.5">
        <SplitDiffView oldText={change.oldText} newText={change.newText} oldLabel={oldLabel} newLabel={newLabel} />
      </div>
    </ToolRow>
  );
}
