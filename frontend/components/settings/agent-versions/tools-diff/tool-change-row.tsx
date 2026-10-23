"use client";

import { type LucideIcon, SquareMinus, SquarePlus } from "lucide-react";

import DiffView from "@/components/ui/diff";
import { cn } from "@/lib/utils";

import ToolRow from "./tool-row";
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
      <DiffView oldText={change.oldText} newText={change.newText} />
    </ToolRow>
  );
}
