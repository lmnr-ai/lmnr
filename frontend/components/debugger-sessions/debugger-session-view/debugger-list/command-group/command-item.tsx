"use client";

import { ChevronDown } from "lucide-react";
import { useMemo } from "react";

import { formatShortRelativeTime } from "@/components/client-timestamp-formatter";
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
 * reasoning when given, else the command summary. The right cluster (static time
 * + plain chevron) is inlined with the same geometry as the group header (`pr-3`
 * + `ml-auto`) so the row's "2h ago ›" lines up vertically with the header's;
 * only the chevron reacts to hover (via this row's own `group/row`), so it never
 * touches the header.
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
      {/* Vertical thread strung between the beads (bead's solid bg covers it
          where they overlap). It spans exactly first bead → last bead: the first
          starts AT its bead, the last ends AT its bead, so nothing dangles at
          either end. 18px = py-1.5 + half the size-6 bead (the bead center). */}
      <div
        className={cn(
          "absolute left-[24px] w-px bg-foreground-600",
          isFirst ? "top-[18px]" : "top-0",
          isLast ? "h-[18px]" : "bottom-0"
        )}
      />
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => toggle(id)}
        className="group/row relative flex w-full items-center gap-2 py-1.5 pl-3 pr-3 text-left"
      >
        <span className="z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-background">
          {commandIcon(command, cn("size-3.5", failed ? "text-destructive-bright" : "text-muted-foreground"))}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] leading-[17px] text-secondary-foreground transition-colors group-hover/row:text-primary-foreground">
          {label}
        </span>
        {/* Inline right cluster. The chevron is wrapped in the SAME `py-0.5 pl-1
            pr-1` the header's CardExpandIndicator pill uses (minus its border /
            bg / label / hover-reveal) so the row's time AND chevron land at the
            exact same x as the header's — just a plain chevron that recolors on
            hover, no animation. */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {relativeTime && (
            <span className="whitespace-nowrap text-[13px] leading-[17px] text-secondary-foreground">
              {relativeTime}
            </span>
          )}
          <span className="flex items-center py-0.5 pl-1 pr-1">
            <ChevronDown
              size={16}
              className={cn(
                "shrink-0 text-muted-foreground transition-colors group-hover/row:text-foreground",
                !expanded && "-rotate-90"
              )}
            />
          </span>
        </div>
      </button>
    </div>
  );
}
