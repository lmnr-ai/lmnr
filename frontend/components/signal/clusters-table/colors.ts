// Tailwind default colors (500 weight), alternating warm/cool per level
const COLOR_PALETTES = [
  // Level 0: fuchsia, indigo, emerald, amber, cyan, rose, blue, lime, orange, teal
  [
    "#3b82f6",
    "#d946ef",
    "#6366f1",
    "#10b981",
    "#f59e0b",
    "#06b6d4",
    "#f43f5e",
    "#84cc16",
    "#f97316",
    "#14b8a6",
    "#0ea5e9",
    "#d946ef",
    "#64748b",
  ],
  // Level 1: indigo, yellow, green, red, sky, fuchsia, slate, orange, emerald, purple
  [
    "#6366f1",
    "#60a5fa",
    "#fb923c",
    "#eab308",
    "#22c55e",
    "#ef4444",
    "#0ea5e9",
    "#d946ef",
    "#64748b",
    "#34d399",
    "#a855f7",
  ],
  // Level 2+: purple, lime, cyan, rose, amber, teal, pink, blue, yellow, emerald
  [
    "#a855f7",
    "#84cc16",
    "#06b6d4",
    "#fb7185",
    "#f59e0b",
    "#2dd4bf",
    "#f472b6",
    "#facc15",
    "#6ee7b7",
    "#34d399",
    "#ef4444",
  ],
];

export function getClusterColor(index: number, depthLevel: number = 0): string {
  const palette = COLOR_PALETTES[Math.min(depthLevel, COLOR_PALETTES.length - 1)];
  return palette[index % palette.length];
}

export function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
