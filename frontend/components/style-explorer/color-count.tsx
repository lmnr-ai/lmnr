"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// Static call-site count for a color token (see gen-color-counts.cjs). 0 = unused → flagged.

import { cn } from "@/lib/utils";

import { colorCounts } from "./color-counts";

export default function ColorCount({ name, className }: { name: string; className?: string }) {
  const count = colorCounts[name] ?? 0;
  const dead = count === 0;
  return (
    <span
      title={dead ? "No call-sites found — unused" : `${count} call-sites`}
      className={cn(
        "shrink-0 rounded-sm px-1 font-mono text-[10px] tabular-nums",
        dead ? "bg-destructive/15 text-destructive" : "text-muted-foreground",
        className
      )}
    >
      {dead ? "0 ⚠" : count}
    </span>
  );
}
