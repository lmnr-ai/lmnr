"use client";

import { useEffect, useState } from "react";

import { type PlotTooltipProps } from "@/components/charts/cartesian-plot";
import { ElevatedSurface } from "@/components/ui/surface";

const DELAY_MS = 300;
const MAX_ITEMS = 12;

/** The dense cluster readout is presentation owned by the cluster page, not the plot. */
export default function ClusterChartTooltip({ label, items, overBar }: PlotTooltipProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!overBar) return;
    const timer = setTimeout(() => setReady(true), DELAY_MS);
    return () => {
      clearTimeout(timer);
      setReady(false);
    };
  }, [overBar]);
  if (!overBar || !ready) return null;

  const nonzero = items.filter((item) => item.value !== 0);
  const visible =
    nonzero.length > MAX_ITEMS ? [...nonzero].sort((a, b) => b.value - a.value).slice(0, MAX_ITEMS) : nonzero;
  const hidden = nonzero.length - visible.length;
  return (
    <ElevatedSurface
      offset={3}
      className="grid min-w-32 items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-md"
    >
      <div className="font-medium">{label}</div>
      <div className="grid gap-1.5">
        {visible.map((item) => (
          <div key={item.key} className="flex w-full items-center gap-2">
            {item.icon ?? <div className="size-2.5 shrink-0 rounded-[2px]" style={{ background: item.color }} />}
            <div className="flex flex-1 items-center justify-between gap-2 leading-none">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="shrink-0 font-mono font-medium tabular-nums text-foreground">
                {item.value.toLocaleString()}
              </span>
            </div>
          </div>
        ))}
        {hidden > 0 && <span className="text-muted-foreground">+{hidden} more</span>}
      </div>
    </ElevatedSurface>
  );
}
