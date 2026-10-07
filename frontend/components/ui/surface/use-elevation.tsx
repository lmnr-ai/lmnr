"use client";

import { type CSSProperties } from "react";

import { clampElevation, surfaceClasses, surfaceVars } from "./classes";
import { useElevationContext } from "./context";
import { type ElevationConfig } from "./types";

/**
 * Resolve an elevation, its paint `className` (surface fill) and its `style` (the relative
 * neighbour vars). Use this ONLY when a library owns the node you must paint — e.g. a Radix
 * content element that must itself be the positioned node: apply both `className` and `style`
 * to it, and re-provide `elevation` to its children via `<ElevationProvider value={elevation}>`.
 * For DOM you own, prefer <ElevatedSurface>, which wires all of this up. Shadows are NOT part of
 * elevation — add a plain Tailwind shadow utility yourself. `level` sets the elevation absolutely,
 * `offset` adds to the current.
 */
export function useElevation({ level, offset }: ElevationConfig = {}): {
  elevation: number;
  className: string;
  style: CSSProperties;
} {
  const current = useElevationContext();
  const elevation = clampElevation(level ?? current + (offset ?? 0));
  return { elevation, className: surfaceClasses(elevation), style: surfaceVars(elevation) };
}
