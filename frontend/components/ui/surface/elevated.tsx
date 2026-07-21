"use client";

import { type ComponentPropsWithoutRef, forwardRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { surfaceClasses } from "./classes";
import { MAX_SURFACE, SurfaceProvider, useSurface } from "./context";

// Conventional offsets, so call sites read intent rather than magic numbers.
export const SURFACE_OFFSET = {
  inline: 1, // cards, panels, anything that lifts a hair off its container
  popover: 2, // popover / dropdown / select / context menu / tooltip
  dialog: 3, // dialog / modal / sheet
} as const;

// Pinned shadow weight per overlay kind, so shadow stays constant with depth.
export const SHADOW_LEVEL = {
  dialog: 6, // dialog / sheet
  popover: 3, // popover / dropdown / select
  tooltip: 2,
  inline: 2, // card / panel
} as const;

/**
 * Level math for components that can't use <Elevated>'s <div> directly — e.g. a
 * Radix content node that must be the positioned element. Returns the computed
 * level (to feed a SurfaceProvider around the children) and the paint classes.
 */
export function useElevated(offset: number, shadowLevel?: number): { level: number; className: string } {
  const level = Math.min(useSurface() + offset, MAX_SURFACE);
  return { level, className: surfaceClasses(level, shadowLevel ?? level) };
}

interface ElevatedProps extends ComponentPropsWithoutRef<"div"> {
  /**
   * Steps above the current substrate. The component's own level becomes
   * `min(substrate + offset, 8)` and is re-provided to descendants, so further
   * nesting keeps walking up the ladder. See SURFACE_OFFSET for conventions.
   */
  offset: number;
  /** Pin the shadow to a fixed level so weight stays constant with depth (see
   *  SHADOW_LEVEL); defaults to the computed level. */
  shadowLevel?: number;
  children?: ReactNode;
}

const Elevated = forwardRef<HTMLDivElement, ElevatedProps>(function Elevated(
  { offset, shadowLevel, className, children, ...props },
  ref
) {
  const substrate = useSurface();
  const level = Math.min(substrate + offset, MAX_SURFACE);
  return (
    <SurfaceProvider value={level}>
      <div ref={ref} className={cn(surfaceClasses(level, shadowLevel ?? level), className)} {...props}>
        {children}
      </div>
    </SurfaceProvider>
  );
});

export { Elevated };
