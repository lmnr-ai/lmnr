import { type CommandBlockContent } from "@/lib/actions/debugger-sessions";

import CommandBlockBody from "../command-block/command-block-body";

interface CommandItemDetailProps {
  command: CommandBlockContent;
  isLastRow: boolean;
}

/**
 * The expanded detail of a grouped command: an indented card (command + output +
 * stderr, identical to a standalone command block's body) offset past the bead
 * so it reads as a child of the row above — like the card indented under a search
 * result. Borderless outside the card itself (the group is a header + flowing
 * rows, not one wrapping card); the vertical connector line continues behind the
 * indent. `[&>*:first-child]:border-t-0` drops the body's leading divider — there
 * is no header directly above it here.
 */
export default function CommandItemDetail({ command, isLastRow }: CommandItemDetailProps) {
  return (
    <div className="relative">
      {/* Continue the connector behind the indent — unless this is the group's
          final row, where a trailing segment would dangle with nothing below. */}
      {!isLastRow && <div className="absolute bottom-0 left-[24px] top-0 w-px bg-foreground-600" />}
      <div className="relative ml-[44px] mr-3 overflow-hidden rounded-lg border border-border bg-surface-800 [&>*:first-child]:border-t-0">
        <CommandBlockBody command={command} />
      </div>
    </div>
  );
}
