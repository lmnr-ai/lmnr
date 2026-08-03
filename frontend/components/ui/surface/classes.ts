import { type CSSProperties } from "react";

import { MIN_ELEVATION } from "./context";

/**
 * SURFACE_BG is the single ground truth for the elevation ladder: elevation index → literal
 * `bg-surface-*` fill class. Tailwind v4's scanner only emits a utility for literal class strings,
 * so the classes are spelled out here (a template-literal `bg-surface-${n}` would be invisible).
 * Everything else derives from it: MAX_ELEVATION is its key count, and a surface's CSS var token is
 * its class with the `bg-surface-` prefix stripped.
 */
export const SURFACE_BG: Record<number, string> = {
  1: "bg-surface-00",
  2: "bg-surface-100",
  3: "bg-surface-150",
  4: "bg-surface-200",
  5: "bg-surface-250",
  6: "bg-surface-300",
  7: "bg-surface-350",
  8: "bg-surface-400",
  9: "bg-surface-450",
  10: "bg-surface-500",
  11: "bg-surface-550",
  12: "bg-surface-600",
  13: "bg-surface-650",
  14: "bg-surface-700",
  15: "bg-surface-750",
  16: "bg-surface-800",
  17: "bg-surface-400",
};

// The top of the elevation ladder = however many entries SURFACE_BG defines (single ground truth).
export const MAX_ELEVATION = Object.keys(SURFACE_BG).length;

const BG_PREFIX = "bg-surface-";

const clampElevation = (n: number): number => Math.round(Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, n)));

// A surface's CSS var token, derived from its ground-truth bg class (prefix stripped, so
// "bg-surface-450" → var(--color-surface-450)).
const surfaceToken = (elevation: number): string =>
  `var(--color-surface-${SURFACE_BG[clampElevation(elevation)].slice(BG_PREFIX.length)})`;

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
    "--color-surface-up-4": surfaceToken(e + 4),
    "--color-surface-up-5": surfaceToken(e + 5),
    "--color-surface-up-6": surfaceToken(e + 6),
    "--color-surface-up-7": surfaceToken(e + 7),
    "--color-surface-up-8": surfaceToken(e + 8),
    "--color-surface-up-9": surfaceToken(e + 9),
    "--color-surface-down": surfaceToken(e - 1),
    "--color-surface-down-2": surfaceToken(e - 2),
    "--color-surface-down-3": surfaceToken(e - 3),
    "--color-surface-down-4": surfaceToken(e - 4),
    "--color-surface-down-5": surfaceToken(e - 5),
    "--color-surface-down-6": surfaceToken(e - 6),
    "--color-surface-down-7": surfaceToken(e - 7),
    "--color-surface-down-8": surfaceToken(e - 8),
    "--color-surface-down-9": surfaceToken(e - 9),
    // Border = the surface fill 5 elevation-steps up; clamps at the top of the ladder, always a
    // defined token, so `border-color` can never fall back to currentColor (white).
    "--color-border": surfaceToken(e + 4),
  } as CSSProperties;
}

/** Returns the "bg-surface-N" fill class for an elevation, clamped to the ladder and rounded so a
 *  fractional value can't index out of the table. Elevation is surface COLOR only — shadows are
 *  decoupled (plain Tailwind shadow utilities at the call site); the relative neighbour vars +
 *  border are published separately as inline style via `surfaceVars`. */
export function surfaceClasses(elevation: number): string {
  return SURFACE_BG[clampElevation(elevation)];
}
