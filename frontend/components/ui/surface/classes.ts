import { MAX_ELEVATION, MIN_ELEVATION } from "./context";

/**
 * Static lookup tables mapping an elevation (1..8) to its raw surface tokens.
 *
 * Tailwind v4's scanner only emits a utility for literal class strings it sees in
 * source. A template-literal name like `bg-surface-${elevation}` is invisible to it, so
 * the utility never gets generated and the background renders transparent. These
 * maps hold the literal names so Tailwind detects and emits each one; pick from them
 * at runtime instead of interpolating.
 */

// Elevations are 1..8; the surface tokens they map to are named in hundreds (surface-100..800).
export const SURFACE_BG: Record<number, string> = {
  1: "bg-surface-100",
  2: "bg-surface-200",
  3: "bg-surface-300",
  4: "bg-surface-400",
  5: "bg-surface-500",
  6: "bg-surface-600",
  7: "bg-surface-700",
  8: "bg-surface-800",
};

export const SURFACE_SHADOW: Record<number, string> = {
  1: "shadow-elevation-100",
  2: "shadow-elevation-200",
  3: "shadow-elevation-300",
  4: "shadow-elevation-400",
  5: "shadow-elevation-500",
  6: "shadow-elevation-600",
  7: "shadow-elevation-700",
  8: "shadow-elevation-800",
};

// Each surface publishes `--surface-raise` = the fill two levels lighter than itself,
// which interactive descendants consume as `hover:bg-[var(--surface-raise)]`. That keeps
// hover/highlight two steps up the scale relative to whatever elevation an element sits at
// (adjacent shades are too close for a one-step lift to read), with no per-element math
// and no collision with the substrate.
export const SURFACE_RAISE: Record<number, string> = {
  1: "[--surface-raise:var(--color-surface-300)]",
  2: "[--surface-raise:var(--color-surface-400)]",
  3: "[--surface-raise:var(--color-surface-500)]",
  4: "[--surface-raise:var(--color-surface-600)]",
  5: "[--surface-raise:var(--color-surface-700)]",
  6: "[--surface-raise:var(--color-surface-800)]",
  7: "[--surface-raise:var(--color-surface-800)]",
  8: "[--surface-raise:var(--color-surface-800)]",
};

const clampElevation = (n: number): number => Math.round(Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, n)));

/** The arbitrary-property class that publishes `--surface-raise` for a surface at `elevation`. */
export function raiseVar(elevation: number): string {
  return SURFACE_RAISE[clampElevation(elevation)];
}

/** Returns "bg-surface-N shadow-elevation-M" plus the raise var for a given elevation,
 *  clamped to 1..8 and rounded so a fractional value can't index out of the tables.
 *  `shadowElevation` defaults to the bg elevation; pass a value < 1 (e.g. 0) for no shadow.
 *  Borders are left to each element's own `border` class + the flat --color-border token. */
export function surfaceClasses(elevation: number, shadowElevation: number = elevation): string {
  const e = clampElevation(elevation);
  const shadow = shadowElevation < MIN_ELEVATION ? "" : SURFACE_SHADOW[clampElevation(shadowElevation)];
  return [SURFACE_BG[e], shadow, SURFACE_RAISE[e]].filter(Boolean).join(" ");
}
