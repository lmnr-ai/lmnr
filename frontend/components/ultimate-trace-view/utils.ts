/**
 * Color palette for signal indicators.
 * 10 visually distinct colors that work on dark backgrounds.
 */
const SIGNAL_COLORS = [
  "#f97316", // orange
  "#06b6d4", // cyan
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#22c55e", // green
  "#eab308", // yellow
  "#3b82f6", // blue
  "#ef4444", // red
  "#14b8a6", // teal
  "#a855f7", // purple
];

/**
 * Hash a signal ID (UUID string) to a deterministic color from the palette.
 */
export function signalIdToColor(signalId: string): string {
  let hash = 0;
  for (let i = 0; i < signalId.length; i++) {
    hash = (hash * 31 + signalId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % SIGNAL_COLORS.length;
  return SIGNAL_COLORS[index];
}
