import { cn } from "@/lib/utils";

import { formatMs } from "../format";

/** Idle-gap rule between two turns; the pill lights up when either neighbour is open. */
export default function TimeDivider({ gapMs, highlighted }: { gapMs: number; highlighted: boolean }) {
  return (
    // h-px: the row is only as tall as the rule; the pill overflows it.
    <div className="mx-auto flex h-px w-full max-w-3xl items-center px-8 text-[11px] text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span
        className={cn(
          "relative z-10 flex h-[19px] items-center rounded-full border border-transparent bg-transparent px-2 leading-none",
          highlighted && "border-border bg-surface-350"
        )}
      >
        {formatMs(gapMs)}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
