"use client";

import { useRouter } from "next/navigation";
import { forwardRef, type MouseEvent, type PointerEvent, type SVGProps } from "react";

import { type TimeSeriesMarker } from "../types";
import MarkerTooltip from "./tooltip";

type MarkerLineProps = {
  x1?: number | string;
  y1?: number | string;
  x2?: number | string;
  y2?: number | string;
  stroke?: string;
  strokeDasharray?: string | number;
  strokeOpacity?: number | string;
  clipPath?: string;
  href?: string;
  tooltip?: TimeSeriesMarker["tooltip"];
};

type MarkerHitAreaProps = Omit<MarkerLineProps, "tooltip"> &
  Omit<SVGProps<SVGGElement>, keyof MarkerLineProps | "onClick">;

const MarkerHitArea = forwardRef<SVGGElement, MarkerHitAreaProps>(function MarkerHitArea(
  {
    x1,
    y1,
    x2,
    y2,
    stroke,
    strokeDasharray,
    strokeOpacity,
    clipPath,
    href,
    onPointerDown,
    onMouseDown,
    style,
    ...rest
  },
  ref
) {
  const router = useRouter();

  const stopZoom = (event: MouseEvent | PointerEvent) => {
    event.stopPropagation();
  };

  const onClick = (event: MouseEvent) => {
    event.stopPropagation();
    if (href) router.push(href);
  };

  return (
    <g
      ref={ref}
      clipPath={clipPath}
      {...rest}
      style={{ cursor: href ? "pointer" : "default", ...style }}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (href) stopZoom(event);
      }}
      onMouseDown={(event) => {
        onMouseDown?.(event);
        if (href) stopZoom(event);
      }}
      onClick={href ? onClick : undefined}
    >
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12} pointerEvents="stroke" />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={stroke}
        strokeDasharray={strokeDasharray}
        strokeOpacity={strokeOpacity}
        pointerEvents="none"
        className="recharts-reference-line-line"
      />
    </g>
  );
});

export default function MarkerLine({
  x1,
  y1,
  x2,
  y2,
  stroke,
  strokeDasharray,
  strokeOpacity,
  clipPath,
  href,
  tooltip,
}: MarkerLineProps) {
  const area = (
    <MarkerHitArea
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={stroke}
      strokeDasharray={strokeDasharray}
      strokeOpacity={strokeOpacity}
      clipPath={clipPath}
      href={href}
    />
  );

  if (!tooltip?.length) return area;

  return <MarkerTooltip entries={tooltip}>{area}</MarkerTooltip>;
}
