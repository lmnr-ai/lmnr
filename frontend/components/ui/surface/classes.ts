import { MAX_SURFACE, MIN_SURFACE } from "./context";

/**
 * Static lookup tables for surface tokens.
 *
 * Tailwind v4's scanner only emits a utility for literal class strings it sees in
 * source. A template-literal name like `bg-surface-${level}` is invisible to it, so
 * the utility never gets generated and the background renders transparent. These
 * maps hold the literal names so Tailwind detects and emits each one; pick from them
 * at runtime instead of interpolating.
 */

// Levels are 1..8; the ramp tokens are named in hundreds (surface-100..800).
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
// hover/highlight two steps up the scale relative to whatever surface an element sits on
// (adjacent shades are too close for a one-step lift to read), with no per-element level
// math and no collision with the substrate.
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

const clampLevel = (n: number): number => Math.round(Math.max(MIN_SURFACE, Math.min(MAX_SURFACE, n)));

/** The arbitrary-property class that publishes `--surface-raise` for a surface at `level`. */
export function raiseVar(level: number): string {
  return SURFACE_RAISE[clampLevel(level)];
}

/** Returns "bg-surface-N shadow-elevation-M" plus the raise var, clamped to 1..8 and
 *  rounded so a fractional level can't index out of the tables. shadow defaults to bg's level.
 *  Borders are a single flat token (--color-border), not per-surface, so nothing is published here.
 *  UNWIRE (#11 edge-treatment configurator): `border-[color:var(--edge-border-color)]` makes a
 *  raised surface's border track the edge variant (None/Border/Micka) instead of the flat
 *  --color-border, so flat elements stay put. To commit to one variant, drop this token and let
 *  raised borders fall back to --color-border. */
export function surfaceClasses(bgLevel: number, shadowLevel: number = bgLevel): string {
  const b = clampLevel(bgLevel);
  return `${SURFACE_BG[b]} ${SURFACE_SHADOW[clampLevel(shadowLevel)]} ${SURFACE_RAISE[b]} border-[color:var(--edge-border-color)]`;
}
