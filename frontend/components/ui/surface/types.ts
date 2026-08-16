import { type HTMLAttributes } from "react";

/**
 * How an elevation is chosen. `level` sets it absolutely; `offset` adds to the surrounding
 * elevation (ignored when `level` is set). Elevation is a surface-COLOR concept only — shadows
 * are fully decoupled, so add a plain Tailwind shadow utility at the call site if you want one.
 */
export interface ElevationConfig {
  /** Set the elevation absolutely, ignoring the surrounding context. */
  level?: number;
  /** Add to the surrounding elevation (default 0 → the current elevation). Ignored if `level` is set. */
  offset?: number;
}

export interface ElevatedSurfaceProps extends ElevationConfig, HTMLAttributes<HTMLDivElement> {
  /** Render onto the single child element instead of a <div> (Radix Slot — merges the paint
   *  className/style/props onto it), so the surface can be a button, section, etc. */
  asChild?: boolean;
}
