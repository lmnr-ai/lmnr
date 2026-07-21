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
  1: "shadow-surface-100",
  2: "shadow-surface-200",
  3: "shadow-surface-300",
  4: "shadow-surface-400",
  5: "shadow-surface-500",
  6: "shadow-surface-600",
  7: "shadow-surface-700",
  8: "shadow-surface-800",
};

const clampLevel = (n: number): number => Math.round(Math.max(MIN_SURFACE, Math.min(MAX_SURFACE, n)));

/** Returns "bg-surface-N shadow-surface-M", clamped to 1..8 and rounded so a
 *  fractional level can't index out of the tables. shadow defaults to bg's level. */
export function surfaceClasses(bgLevel: number, shadowLevel: number = bgLevel): string {
  return `${SURFACE_BG[clampLevel(bgLevel)]} ${SURFACE_SHADOW[clampLevel(shadowLevel)]}`;
}
