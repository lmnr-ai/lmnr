import { type CSSProperties } from "react";

import { MAX_ELEVATION, MIN_ELEVATION } from "./context";

/**
 * Maps an elevation index (1..8) onto the 50-step surface scale (surface-00 … surface-800).
 *
 * Tailwind v4's scanner only emits a utility for literal class strings it sees in source. A
 * template-literal name like `bg-surface-${n}` is invisible to it, so SURFACE_BG holds the literal
 * names; pick from it at runtime instead of interpolating.
 */

// Elevation index → its numeric position on the scale. Preserves the previous 8 elevation colors
// under the new naming (old surface-100..800 → these); the in-between shades (surface-50, 450..800)
// exist for the dynamic border and manual use, not the elevation ladder.
const ELEVATION_SCALE: Record<number, number> = { 1: 0, 2: 100, 3: 150, 4: 200, 5: 250, 6: 300, 7: 350, 8: 400 };

export const SURFACE_BG: Record<number, string> = {
  1: "bg-surface-00",
  2: "bg-surface-100",
  3: "bg-surface-150",
  4: "bg-surface-200",
  5: "bg-surface-250",
  6: "bg-surface-300",
  7: "bg-surface-350",
  8: "bg-surface-400",
};

const SCALE_MAX = 800;
// The border color sits this many scale-units above the surface's own fill — dynamic and
// elevation-relative, so borders lighten as surfaces stack.
const BORDER_OFFSET = 250;

const clampElevation = (n: number): number => Math.round(Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, n)));

// A scale number (0, 50, 100, … 800) → its token name ("00" for 0, else the number, clamped).
const scaleName = (k: number): string => (k <= 0 ? "00" : String(Math.min(SCALE_MAX, k)));

// The surface color token for an elevation index (clamped to 1..8).
const surfaceToken = (elevation: number): string =>
  `var(--color-surface-${scaleName(ELEVATION_SCALE[clampElevation(elevation)])})`;

// The border token for an elevation: its own scale position + BORDER_OFFSET, clamped to the top.
const borderToken = (elevation: number): string =>
  `var(--color-surface-${scaleName(ELEVATION_SCALE[clampElevation(elevation)] + BORDER_OFFSET)})`;

/**
 * The relative-neighbour surface colors (and the elevation-relative border) every painted surface
 * publishes for its level, returned as an inline `style` object. It overrides the THEME color vars
 * directly (`--color-surface`, `--color-surface-up`, …, `--color-border`) — the exact vars the
 * `bg-surface` / `bg-surface-up` / `-up-2` / `-up-3` / `-down` / `-down-2` / `-down-3` utilities and
 * the global `border` read — so a descendant's `hover:bg-surface-up` means "one step above whatever surface
 * I'm sitting on" and `border` tracks the surface's elevation. It MUST set the `--color-*` vars, not
 * an intermediate: an alias like `--color-surface-up: var(--surface-up)` declared at `:root`
 * resolves its `var()` once at `:root` (frozen to the base plane) and a deeper override of the
 * intermediate never propagates. These values are static ramp tokens, so they can't refreeze.
 * Down-steps clamp at the base plane; up-steps and the border clamp at the top.
 */
export function surfaceVars(elevation: number): CSSProperties {
  const e = clampElevation(elevation);
  return {
    "--color-surface": surfaceToken(e),
    "--color-surface-up": surfaceToken(e + 1),
    "--color-surface-up-2": surfaceToken(e + 2),
    "--color-surface-up-3": surfaceToken(e + 3),
    "--color-surface-down": surfaceToken(e - 1),
    "--color-surface-down-2": surfaceToken(e - 2),
    "--color-surface-down-3": surfaceToken(e - 3),
    "--color-border": borderToken(e),
  } as CSSProperties;
}

/** Returns the "bg-surface-N" fill class for an elevation, clamped to 1..8 and rounded so a
 *  fractional value can't index out of the table. Elevation is surface COLOR only — shadows are
 *  decoupled (plain Tailwind shadow utilities at the call site); the relative neighbour vars +
 *  border are published separately as inline style via `surfaceVars`. */
export function surfaceClasses(elevation: number): string {
  return SURFACE_BG[clampElevation(elevation)];
}
