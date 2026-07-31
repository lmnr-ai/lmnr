"use client";

import { Slot } from "@radix-ui/react-slot";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

import { ElevationProvider } from "./context";
import { type ElevatedSurfaceProps } from "./types";
import { useElevation } from "./use-elevation";

/**
 * A painted DOM surface — the one tool for elevation on DOM you own. Atomically: bumps the
 * elevation (default `offset={1}`), paints its surface fill, publishes the relative `--surface*`
 * neighbour vars (so descendants can `bg-surface-up` / `bg-surface-down`), AND provides the new
 * level to its children. Shadows are decoupled — pass a plain Tailwind shadow class via
 * `className` if you want one.
 *
 * Provider placement is deliberate: in the default (<div>) form the div is the ROOT and the
 * provider lives INSIDE it, so a Radix `asChild` parent (e.g. `<PopoverContent asChild>`) can
 * Slot its positioning props/ref onto the div. In the `asChild` form the provider wraps the Slot
 * instead, keeping the Slot's child a real DOM element so prop/ref merging still works.
 */
export const ElevatedSurface = forwardRef<HTMLDivElement, ElevatedSurfaceProps>(function ElevatedSurface(
  { level, offset = 1, asChild, className, style, children, ...props },
  ref
) {
  const { elevation, className: paintClass, style: varStyle } = useElevation({ level, offset });
  const mergedStyle = { ...varStyle, ...style };
  if (asChild) {
    return (
      <ElevationProvider value={elevation}>
        <Slot ref={ref} className={cn(paintClass, className)} style={mergedStyle} {...props}>
          {children}
        </Slot>
      </ElevationProvider>
    );
  }
  return (
    <div ref={ref} className={cn(paintClass, className)} style={mergedStyle} {...props}>
      <ElevationProvider value={elevation}>{children}</ElevationProvider>
    </div>
  );
});
