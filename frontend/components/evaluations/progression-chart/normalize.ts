/**
 * Per-score numeric range over the observed values. Empty set → default [0,1].
 * When `pinUnitRange` is true, a score whose values all sit in [0,1] keeps a
 * fixed 0–1 range (so a small change reads as small instead of being stretched
 * to fill the plot); otherwise every score uses its own observed min/max.
 */
export function computeScoreRange(values: number[], pinUnitRange = false): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity) return { min: 0, max: 1 };
  if (pinUnitRange && min >= 0 && max <= 1) return { min: 0, max: 1 };
  return { min, max };
}

/**
 * Min-max normalize into [0,1] so every score fills the full plot height
 * (no 0–1 special-case). A constant score (no range) draws mid-chart instead
 * of being pinned to an edge. Dot clipping at the extremes is handled by the
 * YAxis pixel padding, not by shrinking this range.
 */
export function normalizeValue(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}
