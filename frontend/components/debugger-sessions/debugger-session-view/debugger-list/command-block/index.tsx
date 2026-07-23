"use client";

import { ChevronRight, SquareTerminal } from "lucide-react";
import { useMemo } from "react";

import { type CommandBlockContent } from "@/lib/actions/debugger-sessions";
import { commandSummary } from "@/lib/actions/debugger-sessions/command-content";
import { cn } from "@/lib/utils";

import { commandAnchorId } from "../../session-outline/utils";
import { useDebuggerSessionViewStore } from "../../store";
import CommandBlockBody from "./command-block-body";

interface CommandBlockProps {
  id: string;
  command: CommandBlockContent;
}

/**
 * A `command` block in the timeline — a CLI command an agent ran. Collapsed by
 * default to a compact terminal-style line (icon + command summary + exit
 * status); click toggles the full command-specific rendering. Expanded state
 * lives in the session store (like `expandedTraceIds`) so it survives the row
 * virtualizing out and back; the outer virtualizer re-measures via
 * `measureElement`'s ResizeObserver on toggle.
 */
export default function CommandBlock({ id, command }: CommandBlockProps) {
  const expanded = useDebuggerSessionViewStore((s) => s.expandedCommandBlockIds.has(id));
  const toggleExpanded = useDebuggerSessionViewStore((s) => s.toggleCommandBlockExpanded);
  const summary = useMemo(() => commandSummary(command), [command]);
  const failed = command.exitCode !== undefined && command.exitCode !== 0;

  return (
    <div id={commandAnchorId(id)} className="scroll-mt-4 py-2">
      <div
        className={cn(
          "overflow-hidden rounded-lg border bg-background transition-colors",
          failed ? "border-destructive/40" : "border-[rgba(232,232,232,0.1)]"
        )}
      >
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => toggleExpanded(id)}
          className={cn(
            "flex h-[40px] w-full items-center gap-2 pl-2 pr-3 text-left transition-colors",
            failed ? "bg-destructive/10 hover:bg-destructive/15" : "bg-muted/75 hover:bg-muted/90"
          )}
        >
          <ChevronRight
            className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")}
          />
          <SquareTerminal className={cn("size-4 shrink-0", failed ? "text-destructive" : "text-muted-foreground")} />
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] leading-[17px] text-primary-foreground">
            {summary}
          </span>
          {command.exitCode !== undefined && (
            <span
              className={cn(
                "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[11px] leading-none",
                failed
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-[rgba(232,232,232,0.1)] text-muted-foreground"
              )}
            >
              exit {command.exitCode}
            </span>
          )}
        </button>
        {expanded && <CommandBlockBody command={command} />}
      </div>
    </div>
  );
}
