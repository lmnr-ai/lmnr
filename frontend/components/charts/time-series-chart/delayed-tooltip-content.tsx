"use client";

import React, { useEffect, useState } from "react";
import { useYAxisScale } from "recharts";

import { ChartTooltipContent } from "@/components/ui/chart";

type DelayedTooltipContentProps = React.ComponentProps<typeof ChartTooltipContent> & {
  delayMs: number;
  requireBar: boolean;
  overlayField?: string;
  // Injected by recharts into whatever it is handed as `content`; not on the
  // Tooltip's own prop type, which is what ChartTooltipContent mirrors.
  coordinate?: { x?: number; y?: number };
};

/**
 * `ChartTooltipContent`, held back until the pointer has dwelled on the plot.
 *
 * The delay lives on the content because gating the `<Tooltip>` itself drops the
 * cursor highlight with it, and recharts has no delay of its own. Keyed on
 * `active` alone, not on the hovered bar, so sliding along the axis does not
 * restart it.
 *
 * `requireBar` suppresses the tooltip in the empty space above a stack. Recharts'
 * own `shared={false}` cannot do it — `ComposedChart` only honours axis-triggered
 * tooltips — so the test is geometric: put the stack total through the y scale
 * and compare with the pointer. The overlay series rides a second axis, so its
 * value is not in the bars' units and is left out of the sum.
 */
export default function DelayedTooltipContent({
  delayMs,
  requireBar,
  overlayField,
  ...props
}: DelayedTooltipContentProps) {
  const yScale = useYAxisScale();
  const { coordinate, payload } = props;

  let overBar = true;
  if (requireBar && yScale && coordinate?.y != null) {
    const total = (payload ?? [])
      .filter((p) => p.dataKey !== overlayField)
      .reduce((sum, p) => sum + (Number(p.value) || 0), 0);
    const top = Number(yScale(total));
    // Fall open rather than shut when the scale gives nothing back: a tooltip
    // that sometimes refuses to appear is worse than an eager one.
    overBar = !Number.isFinite(top) || coordinate.y >= top;
  }

  const open = !!props.active && overBar;
  const [ready, setReady] = useState(false);

  // The reset rides the cleanup rather than an early return, so the effect never
  // sets state synchronously on the way in.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setReady(true), delayMs);
    return () => {
      clearTimeout(timer);
      setReady(false);
    };
  }, [open, delayMs]);

  if (!open || !ready) return null;
  return <ChartTooltipContent {...props} />;
}
