"use client";

import { useMemo } from "react";

import { formatShortRelativeTime } from "@/components/client-timestamp-formatter";
import { CardExpandIndicator } from "@/components/ui/card-expand-indicator";
import { type CommandBlockContent } from "@/lib/actions/debugger-sessions";
import { commandLabel } from "@/lib/actions/debugger-sessions/command-content";
import { cn } from "@/lib/utils";

import { useDebuggerSessionViewStore } from "../../store";
import { commandIcon } from "../command-block/command-icon";

interface CommandItemProps {
  id: string;
  command: CommandBlockContent;
  createdAt: string;
  expanded: boolean;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * One command inside an expanded command group — a bead on the group's vertical
 * connector line (per-command icon, bright-red only on failure) plus its label,
 * itself expandable to a detail card ({@link CommandItemDetail}). Modeled on a
 * trace's spans: borderless (no wrapping card — the group header is the only
 * bordered element), flowing below the header. The label prefers the agent's
 * reasoning when given, else the command summary. The right cluster reuses the
 * header's `CardExpandIndicator` (same `pr-3` + `ml-auto`) so the child's
 * "2h ago ›" lines up vertically with the header's. The `group` scope is this
 * button's own, so its expand affordance reveals on this row's hover only.
 */
export default function CommandItem({ id, command, createdAt, expanded, isFirst, isLast }: CommandItemProps) {
  const toggle = useDebuggerSessionViewStore((s) => s.toggleCommandBlockExpanded);
  const label = useMemo(() => commandLabel(command), [command]);
  const relativeTime = useMemo(() => {
    try {
      return formatShortRelativeTime(new Date(createdAt));
    } catch {
      return "";
    }
  }, [createdAt]);
  const failed = command.exitCode !== undefined && command.exitCode !== 0;

  return (
    <div className="relative">
      {/* Vertical thread through the beads (bead's solid bg covers it where they
          overlap). First reaches UP into the header gap; last stops AT its bead
          (h-[18px] = py-1.5 + half the size-6 bead) so nothing dangles below. */}
      <div
        className={cn(
          "absolute left-[24px] w-px bg-border",
          isFirst ? "top-[-6px]" : "top-0",
          isLast ? "h-[18px]" : "bottom-0"
        )}
      />
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => toggle(id)}
        className="group group/row relative flex w-full items-center gap-2 py-1.5 pl-3 pr-3 text-left"
      >
        <span className="z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-background">
          {commandIcon(command, cn("size-3.5", failed ? "text-destructive-bright" : "text-muted-foreground"))}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] leading-[17px] text-secondary-foreground transition-colors group-hover/row:text-primary-foreground">
          {label}
        </span>
        <CardExpandIndicator expanded={expanded} relativeTime={relativeTime} className="ml-auto" />
      </button>
    </div>
  );
}
