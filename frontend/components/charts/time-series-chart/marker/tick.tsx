"use client";

import { useRouter } from "next/navigation";
import { type SyntheticEvent } from "react";

import { type TimeSeriesMarker } from "../types";
import MarkerTooltip from "./tooltip";

type MarkerTickProps = {
  x1?: number | string;
  y1?: number | string;
  y2?: number | string;
  label?: string;
  href?: string;
  tooltip?: TimeSeriesMarker["tooltip"];
};

// Stops the press from also starting the chart's drag-zoom.
const stopPropagation = (event: SyntheticEvent) => event.stopPropagation();

export default function MarkerTick({ x1, y1, y2, label, href, tooltip }: MarkerTickProps) {
  const router = useRouter();
  const x = Number(x1);
  const top = Math.min(Number(y1), Number(y2));
  if (!Number.isFinite(x) || !Number.isFinite(top)) return null;

  const tick = (
    <g
      style={{ cursor: href ? "pointer" : "default" }}
      onPointerDown={href ? stopPropagation : undefined}
      onMouseDown={href ? stopPropagation : undefined}
      onClick={
        href
          ? (event) => {
              event.stopPropagation();
              router.push(href);
            }
          : undefined
      }
    >
      <path d={`M${x - 4},${top - 9} L${x + 4},${top - 9} L${x},${top - 3} Z`} fill="var(--color-muted-foreground)" />
      {label && (
        <text x={x + 6} y={top - 3} fontSize={10} fill="var(--color-muted-foreground)">
          {label}
        </text>
      )}
    </g>
  );

  if (!tooltip?.length) return tick;

  return <MarkerTooltip entries={tooltip}>{tick}</MarkerTooltip>;
}
