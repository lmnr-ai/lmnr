"use client";

import { ChevronDown, SquareTerminal } from "lucide-react";
import { useMemo } from "react";

import { formatShortRelativeTime } from "@/components/client-timestamp-formatter";
import { cn } from "@/lib/utils";

import { commandAnchorId } from "../../session-outline/utils";
import { useDebuggerSessionViewStore } from "../../store";

interface CommandGroupHeaderProps {
  id: string;
  count: number;
  lastCreatedAt: string;
  expanded: boolean;
}

/**
 * Header row of a run of ≥2 CLI commands ("CLI commands (N)"). Modeled on a trace
 * in the debugger: a SELF-CONTAINED rounded, bordered header card — when expanded
 * the bead rows flow BELOW it borderless (like a trace's spans), so the header
 * stays fully `rounded-lg` in both states (never `rounded-t` / stitched into a
 * continuous card). NOT sticky (excluded from `headerIndexByRow`). The `group`
 * class lives on THIS button only, so hovering the bead rows below never reveals
 * the header's expand label. `SquareTerminal` is the group identity; individual
 * commands use per-command icons (see `command-icon`).
 */
export default function CommandGroupHeader({ id, count, lastCreatedAt, expanded }: CommandGroupHeaderProps) {
  const toggle = useDebuggerSessionViewStore((s) => s.toggleCommandGroupExpanded);
  const relativeTime = useMemo(() => {
    try {
      return lastCreatedAt ? formatShortRelativeTime(new Date(lastCreatedAt)) : "";
    } catch {
      return "";
    }
  }, [lastCreatedAt]);

  // No block padding — inter-block spacing is owned by seam rows (see flat-rows).
  // `pb-1` when open is the INTERNAL header→beads gap, not an inter-block gap.
  return (
    <div id={commandAnchorId(id)} className={cn("scroll-mt-4", expanded && "pb-1")}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => toggle(id)}
        className="group flex h-[40px] w-full items-center gap-2 rounded-lg border border-border bg-muted/80 pl-2 pr-3 text-left transition-colors hover:bg-muted"
      >
        <SquareTerminal className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[13px] leading-[17px] text-primary-foreground">
          CLI commands ({count})
        </span>
        {/* Inline right cluster — kept identical to the command rows so the
            header's time/chevron align vertically with theirs. */}
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
    </div>
  );
}
