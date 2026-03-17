export const UNCLUSTERED_COLOR = "var(--color-primary)";

// Tailwind v4 color variables, alternating warm/cool per level
const COLOR_PALETTES = [
  // Level 0
  [
    "var(--color-blue-500)",
    "var(--color-fuchsia-500)",
    "var(--color-indigo-500)",
    "var(--color-emerald-500)",
    "var(--color-amber-500)",
    "var(--color-cyan-500)",
    "var(--color-rose-500)",
    "var(--color-lime-500)",
    "var(--color-orange-500)",
    "var(--color-teal-500)",
    "var(--color-sky-500)",
    "var(--color-violet-500)",
    "var(--color-slate-500)",
  ],
  // Level 1
  [
    "var(--color-indigo-500)",
    "var(--color-blue-400)",
    "var(--color-orange-400)",
    "var(--color-yellow-500)",
    "var(--color-green-500)",
    "var(--color-red-500)",
    "var(--color-sky-500)",
    "var(--color-fuchsia-500)",
    "var(--color-slate-500)",
    "var(--color-emerald-400)",
    "var(--color-purple-500)",
  ],
  // Level 2+
  [
    "var(--color-purple-500)",
    "var(--color-lime-500)",
    "var(--color-cyan-500)",
    "var(--color-rose-400)",
    "var(--color-amber-500)",
    "var(--color-teal-400)",
    "var(--color-pink-400)",
    "var(--color-yellow-400)",
    "var(--color-emerald-300)",
    "var(--color-emerald-400)",
    "var(--color-red-500)",
  ],
];

export function getClusterColor(index: number, depthLevel: number = 0): string {
  const palette = COLOR_PALETTES[Math.min(depthLevel, COLOR_PALETTES.length - 1)];
  return palette[index % palette.length];
}

export function withOpacity(color: string, opacity: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
}
