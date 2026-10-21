"use client";

import { ChevronRight, type LucideIcon, SquareMinus, SquarePlus } from "lucide-react";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import DiffView from "@/components/ui/diff";
import { cn } from "@/lib/utils";

import { type ToolChange, type ToolChangeStatus } from "./utils";

const STATUS_ICONS: Record<ToolChangeStatus, { icon: LucideIcon; className: string } | null> = {
  added: { icon: SquarePlus, className: "text-success" },
  removed: { icon: SquareMinus, className: "text-destructive" },
  modified: null,
};

interface ToolChangeRowProps {
  change: ToolChange;
}

export default function ToolChangeRow({ change }: ToolChangeRowProps) {
  const [open, setOpen] = useState(false);
  const status = STATUS_ICONS[change.status];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/50 transition-colors"
        >
          <ChevronRight
            className={cn("size-3.5 flex-shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <span className="truncate font-mono text-xs">{change.name}</span>
          {status && (
            <status.icon className={cn("size-3.5 flex-shrink-0", status.className)} aria-label={change.status} />
          )}
          <span className="ml-auto flex flex-shrink-0 gap-1.5 font-mono text-xs">
            {change.additions > 0 && <span className="text-success">+{change.additions}</span>}
            {change.deletions > 0 && <span className="text-destructive">−{change.deletions}</span>}
          </span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-2">
        <DiffView oldText={change.oldText} newText={change.newText} />
      </CollapsibleContent>
    </Collapsible>
  );
}
