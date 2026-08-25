"use client";

import { SquareTerminal } from "lucide-react";
import { useMemo } from "react";

import { formatShortRelativeTime } from "@/components/client-timestamp-formatter";
import { CardExpandIndicator } from "@/components/ui/card-expand-indicator";
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
 * Header row of a CLI command run — one or many ("CLI command" / "CLI commands
 * (N)"); every run is a group, even of one. Modeled on a trace
 * in the debugger: a SELF-CONTAINED rounded, bordered header card — when expanded
 * the bead rows flow BELOW it borderless (like a trace's spans), so the header
 * stays fully `rounded-lg` in both states (never `rounded-t` / stitched into a
 * continuous card). NOT sticky (excluded from `headerIndexByRow`). The `group`
 * class lives on THIS button only, so hovering the bead rows below never reveals
 * the header's expand label. `SquareTerminal` is the group identity; individual
 * commands use per-command icons (see `command-icon`). Uses the shared
 * `CardExpandIndicator` (like the trace/eval card headers) — the group header is
 * a card header; the bead rows below use a plainer inline chevron.
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
          {count === 1 ? (
            "CLI command"
          ) : (
            <>
              CLI commands
              <span className="text-secondary-foreground">{` (${count})`}</span>
            </>
          )}
        </span>
        <CardExpandIndicator expanded={expanded} relativeTime={relativeTime} className="ml-auto" />
      </button>
    </div>
  );
}
