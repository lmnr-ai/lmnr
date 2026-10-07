import { useEffect, useState } from "react";

import { type CommandBlockContent } from "@/lib/actions/debugger-sessions";
import { cn } from "@/lib/utils";

import CommandBlockBody from "../command-block/command-block-body";

interface CommandItemDetailProps {
  commandId: string;
  command: CommandBlockContent;
  isLastRow: boolean;
}

// Command-detail ids that have already played their open reveal. Module-scoped
// (NOT store) so a virtualized REMOUNT — scrolling the row out of overscan and
// back — renders open instantly instead of replaying the 200ms animation. Keyed
// by the command's UUID; grows for the page lifetime (tiny — a set of strings).
const revealedDetailIds = new Set<string>();

/**
 * The expanded detail of a grouped command: an indented card (command + output +
 * stderr, identical to a standalone command block's body) offset past the bead
 * so it reads as a child of the row above — like the card indented under a search
 * result. Borderless outside the card itself (the group is a header + flowing
 * rows, not one wrapping card); the vertical connector line continues behind the
 * indent. `[&>*:first-child]:border-t-0` drops the body's leading divider — there
 * is no header directly above it here.
 *
 * Reveal: a CSS `grid-template-rows: 0fr → 1fr` transition (with an
 * `overflow-hidden` `min-h-0` child) animates the height open. This changes the
 * ROW's measured height each frame, which the virtualizer's `measureElement`
 * ResizeObserver follows, sliding the rows below. Pure CSS — no per-frame React
 * work — and `FlatRowContent` is memoized so the measurement-driven list
 * re-renders don't re-render this (heavy) subtree during the tween.
 */
export default function CommandItemDetail({ commandId, command, isLastRow }: CommandItemDetailProps) {
  // Animate only the FIRST reveal; an already-revealed remount opens with no
  // transition (open=true from the first paint).
  const [open, setOpen] = useState(() => revealedDetailIds.has(commandId));
  useEffect(() => {
    if (revealedDetailIds.has(commandId)) return;
    // Flip on the next frame so the browser paints 0fr first, then transitions.
    const id = requestAnimationFrame(() => {
      revealedDetailIds.add(commandId);
      setOpen(true);
    });
    return () => cancelAnimationFrame(id);
  }, [commandId]);

  return (
    <div className="relative py-1">
      {/* Continue the connector behind the indent — unless this is the group's
          final row, where a trailing segment would dangle with nothing below. */}
      {!isLastRow && <div className="absolute bottom-0 left-4 top-0 w-px bg-foreground-600" />}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="relative ml-10 mr-3 overflow-hidden rounded-lg border border-border bg-surface-100 [&>*:first-child]:border-t-0">
            <CommandBlockBody command={command} />
          </div>
        </div>
      </div>
    </div>
  );
}
