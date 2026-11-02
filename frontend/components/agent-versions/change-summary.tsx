import { Fragment } from "react";

import { cn } from "@/lib/utils";

import { STATUS_ICONS } from "./tools-diff/status-icons";
import { type ToolChangeStatus } from "./tools-diff/utils";
import { type SummarySegment } from "./utils";

function ToolPill({ tool, status }: { tool: string; status: ToolChangeStatus }) {
  const statusIcon = STATUS_ICONS[status];
  return (
    <code className="inline-flex items-center gap-1 rounded bg-emphasis-2 px-1 py-0.5 align-middle font-mono text-[0.85em] text-foreground">
      {statusIcon && <statusIcon.icon className={cn("size-3.5 shrink-0", statusIcon.className)} aria-label={status} />}
      {tool}
    </code>
  );
}

export default function ChangeSummary({ segments, className }: { segments: SummarySegment[]; className?: string }) {
  return (
    <span className={cn("text-sm font-medium", className)}>
      {segments.map((segment, i) =>
        typeof segment === "string" ? (
          <Fragment key={i}>{segment}</Fragment>
        ) : (
          <ToolPill key={i} tool={segment.tool} status={segment.status} />
        )
      )}
    </span>
  );
}
