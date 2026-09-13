"use client";

import { useRouter } from "next/navigation";
import { forwardRef, type MouseEvent, type PointerEvent, type SVGProps } from "react";

import { type TimeSeriesMarker } from "../types";
import MarkerTooltip from "./tooltip";

type MarkerLabelProps = {
  value?: string;
  href?: string;
  tooltip?: TimeSeriesMarker["tooltip"];
  x?: number | string;
  y?: number | string;
  viewBox?: { x?: number; y?: number };
};

type MarkerLabelTextProps = Omit<MarkerLabelProps, "tooltip"> &
  Omit<SVGProps<SVGTextElement>, keyof MarkerLabelProps | "onClick">;

/**
 * Custom ReferenceLine label so a click can navigate. mouseDown/pointerDown
 * must stopPropagation or the chart's drag-zoom starts on the same press.
 */
const MarkerLabelText = forwardRef<SVGTextElement, MarkerLabelTextProps>(function MarkerLabelText(
  { value, href, x: xProp, y: yProp, viewBox, onPointerDown, onMouseDown, style, ...rest },
  ref
) {
  const router = useRouter();
  const x = Number(xProp ?? (viewBox?.x ?? 0) + 6);
  const y = Number(yProp ?? (viewBox?.y ?? 0) + 14);

  const stopZoom = (event: MouseEvent | PointerEvent) => {
    event.stopPropagation();
  };

  const onClick = (event: MouseEvent) => {
    event.stopPropagation();
    if (href) router.push(href);
  };

  return (
    <text
      ref={ref}
      x={Number.isFinite(x) ? x : 0}
      y={Number.isFinite(y) ? y : 0}
      fontSize={10}
      fill="var(--color-muted-foreground)"
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
      {value}
    </text>
  );
});

export default function MarkerLabel({ value, href, tooltip, x, y, viewBox }: MarkerLabelProps) {
  if (!value) return null;

  const text = <MarkerLabelText value={value} href={href} x={x} y={y} viewBox={viewBox} />;
  if (!tooltip?.length) return text;

  return <MarkerTooltip entries={tooltip}>{text}</MarkerTooltip>;
}
