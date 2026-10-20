"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import DiffView from "@/components/ui/diff";
import { cn } from "@/lib/utils";

import { type ToolChange, type ToolChangeStatus } from "./utils";

const STATUS_STYLES: Record<ToolChangeStatus, { label: string; className: string }> = {
  added: { label: "Added", className: "text-success border-success/40" },
  removed: { label: "Removed", className: "text-destructive border-destructive/40" },
  modified: { label: "Modified", className: "text-primary border-primary/40" },
};

interface ToolChangeRowProps {
  change: ToolChange;
  defaultOpen: boolean;
}

export default function ToolChangeRow({ change, defaultOpen }: ToolChangeRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const status = STATUS_STYLES[change.status];

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
          <Badge variant="outline" className={cn("ml-auto h-5 font-normal", status.className)}>
            {status.label}
          </Badge>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-2">
        <DiffView oldText={change.oldText} newText={change.newText} />
      </CollapsibleContent>
    </Collapsible>
  );
}
