"use client";

import { type ComponentPropsWithoutRef, forwardRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { surfaceClasses } from "./classes";
import { ElevationProvider, MAX_ELEVATION, useElevation } from "./context";

/**
 * Elevation math for components that can't render <Elevated>'s own <div> — e.g. a
 * Radix content node that must itself be the positioned element. Returns the computed
 * elevation (to feed an <ElevationProvider> around the children) and the paint classes.
 *
 * Q (from review): would Radix `asChild`/Slot — or Base UI's `render` prop, since we may
 * migrate — remove the need for this hook? No. Slot/render only merge props+ref onto an
 * existing child; they don't inject the elevation *context* descendants read, and the
 * positioned node stays owned by Radix. We already style that node directly via `className`,
 * so the remaining job is (1) compute the elevation and (2) provide it to children — exactly
 * what this hook + <ElevationProvider> do. Slots are orthogonal; they wouldn't help here.
 *
 * `shadowElevation` defaults to the computed elevation; pass 0 for no shadow.
 */
export function useElevated(offset: number, shadowElevation?: number): { elevation: number; className: string } {
  const elevation = Math.min(useElevation() + offset, MAX_ELEVATION);
  return { elevation, className: surfaceClasses(elevation, shadowElevation ?? elevation) };
}

interface ElevatedProps extends ComponentPropsWithoutRef<"div"> {
  /**
   * Steps above the current elevation. The element's own elevation becomes
   * `min(current + offset, 8)` and is re-provided to descendants, so nested
   * surfaces keep walking up the ladder.
   */
  offset: number;
  /** Pin the shadow to a fixed elevation so weight stays constant with depth; pass 0
   *  for no shadow. Defaults to the computed elevation. */
  shadowElevation?: number;
  children?: ReactNode;
}

const Elevated = forwardRef<HTMLDivElement, ElevatedProps>(function Elevated(
  { offset, shadowElevation, className, children, ...props },
  ref
) {
  const elevationLevel = useElevation();
  const elevation = Math.min(elevationLevel + offset, MAX_ELEVATION);
  return (
    <ElevationProvider value={elevation}>
      <div ref={ref} className={cn(surfaceClasses(elevation, shadowElevation ?? elevation), className)} {...props}>
        {children}
      </div>
    </ElevationProvider>
  );
});

export { Elevated };
