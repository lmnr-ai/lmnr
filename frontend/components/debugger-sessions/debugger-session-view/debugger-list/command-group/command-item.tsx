"use client";

import { ChevronDown } from "lucide-react";
import { useMemo } from "react";

import { type CommandBlockContent } from "@/lib/actions/debugger-sessions";
import { commandLabelParts } from "@/lib/actions/debugger-sessions/command-content";
import { cn } from "@/lib/utils";

import { useDebuggerSessionViewStore } from "../../store";
import { commandIcon } from "../command-block/command-icon";

interface CommandItemProps {
  id: string;
  command: CommandBlockContent;
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
 * reasoning when given, else the command summary. No timestamp on rows (only the
 * group header carries one); just a plain chevron that recolors on this row's
 * hover. The chevron keeps the SAME `py-0.5 pl-1 pr-1` the header's
 * CardExpandIndicator pill uses so it lines up vertically with the header's.
 */
export default function CommandItem({ id, command, expanded, isFirst, isLast }: CommandItemProps) {
  const toggle = useDebuggerSessionViewStore((s) => s.toggleCommandBlockExpanded);
  // Reasoning is prose → normal font; a command summary → mono.
  const { text: label, fromReasoning } = useMemo(() => commandLabelParts(command), [command]);
  const failed = command.exitCode !== undefined && command.exitCode !== 0;

  return (
    <div className="relative">
      {/* Vertical thread strung between the beads (bead's solid bg covers it
          where they overlap). It spans exactly first bead → last bead: the first
          starts AT its bead, the last ends AT its bead, so nothing dangles at
          either end. 18px = py-1.5 + half the size-6 bead (the bead center). A
          lone bead (first AND last) connects to nothing, so it draws no thread —
          otherwise top-[18px]+h-[18px] would dangle a stub below the bead. */}
      {!(isFirst && isLast) && (
        <div
          className={cn(
            "absolute left-4 w-px bg-foreground-600",
            isFirst ? "top-[18px]" : "top-0",
            isLast ? "h-[18px]" : "bottom-0"
          )}
        />
      )}
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => toggle(id)}
        className="group/row relative flex w-full items-center gap-3 py-1.5 pl-1.5 pr-3 text-left"
      >
        <span className="z-10 flex size-5.5 shrink-0 items-center justify-center rounded-full bg-background">
          {commandIcon(command, cn("size-3.5", failed ? "text-destructive-bright" : "text-muted-foreground"))}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px] leading-[17px] text-secondary-foreground transition-colors group-hover/row:text-primary-foreground",
            !fromReasoning && "font-mono"
          )}
        >
          {label}
        </span>
        <span className="ml-auto flex items-center py-0.5 pl-1 pr-1">
          <ChevronDown
            size={16}
            className={cn(
              "shrink-0 text-muted-foreground transition-colors group-hover/row:text-foreground",
              !expanded && "-rotate-90"
            )}
          />
        </span>
      </button>
    </div>
  );
}
