import { clamp } from "lodash";
import { type CSSProperties } from "react";

/**
 * The elevation ladder: level 1 (base plane) … 16 (most elevated), each naming its step on the
 * 50-step surface scale (surface-00 … surface-800). The in-between shade surface-50 exists for
 * manual use and is not on the ladder.
 *
 * Tailwind v4's scanner only emits a utility for literal class strings it sees in source. A
 * template-literal name like `bg-surface-${n}` is invisible to it, so SURFACE_BG spells the names
 * out; pick from it at runtime instead of interpolating. Keying it `Record<Elevation, string>` ties
 * it to the levels below, so a level can never have a fill class without a color token or vice
 * versa — that drift is what produced `var(--color-surface-NaN)` and white borders.
 */
const ELEVATION_TOKEN = {
  1: "00",
  2: "100",
  3: "150",
  4: "200",
  5: "250",
  6: "300",
  7: "350",
  8: "400",
  9: "450",
  10: "500",
  11: "550",
  12: "600",
  13: "650",
  14: "700",
  15: "750",
  16: "800",
} as const;

type Elevation = keyof typeof ELEVATION_TOKEN;

export const SURFACE_BG: Record<Elevation, string> = {
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
};

export const MIN_ELEVATION = 1;
// Derived, so adding a rung to the ladder above is the only edit needed to extend the range.
export const MAX_ELEVATION = Object.keys(ELEVATION_TOKEN).length;

/** Snap any number onto a real ladder level. Rounded so a fractional offset can't miss the table. */
export const clampElevation = (n: number): Elevation => Math.round(clamp(n, MIN_ELEVATION, MAX_ELEVATION)) as Elevation;

// The surface color token for an elevation level (clamped to the ladder).
const surfaceToken = (elevation: number): string =>
  `var(--color-surface-${ELEVATION_TOKEN[clampElevation(elevation)]})`;

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
    "--color-surface-down": surfaceToken(e - 1),
    "--color-surface-down-2": surfaceToken(e - 2),
    "--color-surface-down-3": surfaceToken(e - 3),
    "--color-surface-down-4": surfaceToken(e - 4),
    "--color-surface-down-5": surfaceToken(e - 5),
    "--color-surface-down-6": surfaceToken(e - 6),
    "--color-surface-down-7": surfaceToken(e - 7),
    "--color-surface-down-8": surfaceToken(e - 8),
    // Border = the surface fill 5 elevation-steps up; clamps at the top of the ladder, always a
    // defined token, so `border-color` can never fall back to currentColor (white).
    "--color-border": surfaceToken(e + 5),
  } as CSSProperties;
}

/** Returns the "bg-surface-N" fill class for an elevation, clamped onto the ladder. Elevation is
 *  surface COLOR only — shadows are decoupled (plain Tailwind shadow utilities at the call site);
 *  the relative neighbour vars + border are published separately as inline style via
 *  `surfaceVars`. */
export function surfaceClasses(elevation: number): string {
  return SURFACE_BG[clampElevation(elevation)];
}
