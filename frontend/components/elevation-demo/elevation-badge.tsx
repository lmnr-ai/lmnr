"use client";

import { useElevation } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/**
 * Live read-out of the current elevation from context. Drop it inside any surface (or
 * overlay) to prove which level the tree resolved to — the dot is painted with that
 * level's raw token so it matches the surface behind it.
 */
export function ElevationBadge({ label = "elevation", className }: { label?: string; className?: string }) {
  const { elevation } = useElevation();
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border bg-surface-down px-2 py-0.5 font-mono text-[11px] text-muted-foreground",
        className
      )}
    >
      <span className="size-2.5 rounded-full bg-surface ring-1 ring-inset ring-white/10" />
      {label} {elevation}
    </span>
  );
}
