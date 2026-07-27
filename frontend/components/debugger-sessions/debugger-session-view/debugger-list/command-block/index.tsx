"use client";

import { ChevronDown } from "lucide-react";
import { useMemo } from "react";

import { formatShortRelativeTime } from "@/components/client-timestamp-formatter";
import { type CommandBlockContent } from "@/lib/actions/debugger-sessions";
import { commandLabel } from "@/lib/actions/debugger-sessions/command-content";
import { cn } from "@/lib/utils";

import { commandAnchorId } from "../../session-outline/utils";
import { useDebuggerSessionViewStore } from "../../store";
import CommandBlockBody from "./command-block-body";
import { commandIcon } from "./command-icon";

interface CommandBlockProps {
  id: string;
  createdAt: string;
  command: CommandBlockContent;
}

/**
 * A `command` block in the timeline — a CLI command an agent ran. Collapsed by
 * default to a compact terminal-style line (icon + command summary + the shared
 * relative-time / expand indicator); click toggles the full command-specific
 * rendering. Expanded state lives in the session store (like `expandedTraceIds`)
 * so it survives the row virtualizing out and back; the outer virtualizer
 * re-measures via `measureElement`'s ResizeObserver on toggle.
 *
 * Header chrome matches the trace and evaluation cards: identical background and
 * the shared `CardExpandIndicator` on the right. Failure is signalled only by
 * the terminal icon turning `destructive-bright` — there is no exit-code badge
 * and the header stays the same neutral background as a success.
 */
export default function CommandBlock({ id, createdAt, command }: CommandBlockProps) {
  const expanded = useDebuggerSessionViewStore((s) => s.expandedCommandBlockIds.has(id));
  const toggleExpanded = useDebuggerSessionViewStore((s) => s.toggleCommandBlockExpanded);
  const summary = useMemo(() => commandLabel(command), [command]);
  const relativeTime = useMemo(() => {
    try {
      return formatShortRelativeTime(new Date(createdAt));
    } catch {
      return "";
    }
  }, [createdAt]);
  const failed = command.exitCode !== undefined && command.exitCode !== 0;

  // No vertical padding — inter-block spacing is owned by seam rows (see flat-rows).
  return (
    <div id={commandAnchorId(id)} className="scroll-mt-4">
      <div className="group overflow-hidden rounded-lg border border-[rgba(232,232,232,0.1)]">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => toggleExpanded(id)}
          className="flex h-[40px] w-full items-center gap-2 bg-muted/75 pl-2 pr-3 text-left transition-colors hover:bg-muted/90"
        >
          {/* The icon carries the failure signal (bright-red) — there is no
              separate exit-code badge and the header keeps the neutral bg. */}
          {commandIcon(command, cn("size-4 shrink-0", failed ? "text-destructive-bright" : "text-muted-foreground"))}
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] leading-[17px] text-primary-foreground">
            {summary}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {relativeTime && (
              <span className="whitespace-nowrap text-[13px] leading-[17px] text-secondary-foreground">
                {relativeTime}
              </span>
            )}
            <ChevronDown
              size={16}
              className={cn(
                "shrink-0 text-muted-foreground transition-colors group-hover:text-foreground",
                !expanded && "-rotate-90"
              )}
            />
          </div>
        </button>
        {expanded && (
          <div className="bg-surface-800">
            <CommandBlockBody command={command} />
          </div>
        )}
      </div>
    </div>
  );
}
