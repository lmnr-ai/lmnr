"use client";

import { cn } from "@/lib/utils";

// The full 50-step surface ramp. L values + tags mirror the OKLCH ramp and semantic token bindings
// in globals.css (@theme --color-surface-*), duplicated here only for this diagnostic read-out.
// The bg-surface-* literals also make Tailwind emit every step's utility. `border` is NOT a fixed
// step anymore — it's dynamic (elevation + 300), shown on the surfaces stack instead.
const SCALE: { name: string; l: number; bg: string; tag?: string }[] = [
  { name: "00", l: 0.1344, bg: "bg-surface-00", tag: "background" },
  { name: "50", l: 0.1583, bg: "bg-surface-50" },
  { name: "100", l: 0.1822, bg: "bg-surface-100", tag: "secondary" },
  { name: "150", l: 0.204, bg: "bg-surface-150" },
  { name: "200", l: 0.226, bg: "bg-surface-200" },
  { name: "250", l: 0.248, bg: "bg-surface-250", tag: "muted" },
  { name: "300", l: 0.27, bg: "bg-surface-300", tag: "accent" },
  { name: "350", l: 0.292, bg: "bg-surface-350" },
  { name: "400", l: 0.314, bg: "bg-surface-400" },
  { name: "450", l: 0.336, bg: "bg-surface-450" },
  { name: "500", l: 0.358, bg: "bg-surface-500" },
  { name: "550", l: 0.38, bg: "bg-surface-550" },
  { name: "600", l: 0.402, bg: "bg-surface-600" },
  { name: "650", l: 0.424, bg: "bg-surface-650" },
  { name: "700", l: 0.446, bg: "bg-surface-700" },
  { name: "750", l: 0.468, bg: "bg-surface-750" },
  { name: "800", l: 0.49, bg: "bg-surface-800" },
];

export function ScaleSwatches() {
  return (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
      {SCALE.map(({ name, l, bg, tag }, i) => {
        const delta = i === 0 ? null : l - SCALE[i - 1].l;
        return (
          <div key={name} className="space-y-1">
            <div className={cn("flex h-14 items-center justify-center rounded-md border", bg)}>
              <span className="font-mono text-[11px] text-foreground/80">{l.toFixed(3)}</span>
            </div>
            <div className="text-center">
              <p className="font-mono text-[10px] text-muted-foreground">{name}</p>
              <p className="font-mono text-[10px] text-muted-foreground/50">
                {delta == null ? "—" : `Δ ${delta.toFixed(3)}`}
              </p>
              {tag && <p className="text-[10px] font-medium text-primary">{tag}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
