"use client";

import { cn } from "@/lib/utils";

// The relative-bump utilities, in ramp order. Rendered inside whatever surface hosts
// this component, so each swatch reflects THAT surface's neighbours — drop it in a card, a
// popover, or a tooltip to verify the --surface* vars publish there too.
const SWATCHES = [
  "bg-surface-down-3",
  "bg-surface-down-2",
  "bg-surface-down",
  "bg-surface",
  "bg-surface-up",
  "bg-surface-up-2",
  "bg-surface-up-3",
] as const;

export function SurfaceSwatches({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-7 gap-2", className)}>
      {SWATCHES.map((cls) => (
        <div key={cls} className="space-y-1.5">
          <div className={cn("h-10 rounded-md border", cls)} />
          <p className="text-center font-mono text-[10px] leading-tight text-muted-foreground">
            {cls.replace("bg-surface", "").replace(/^-/, "") || "current"}
          </p>
        </div>
      ))}
    </div>
  );
}
