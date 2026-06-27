// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// Seed constants for the 3 color buckets defined in globals.css. Data only, no JSX.

export interface SurfacePoint {
  key: string; // e.g. "surface-800"
  t: number; // 0..1 interpolation param (X axis)
  l: number; // 0..1 OKLCH lightness (Y axis)
}

export interface SurfaceEndpoints {
  cStart: number;
  hStart: number;
  cEnd: number;
  hEnd: number;
}

// Bucket 1 — OKLCH @theme surface scale (curve editor target). Lightness seeds, ordered 200..1000.
export const SURFACE_SEED: { key: string; l: number }[] = [
  { key: "surface-200", l: 0.3092 },
  { key: "surface-300", l: 0.2891 },
  { key: "surface-400", l: 0.2686 },
  { key: "surface-500", l: 0.2478 },
  { key: "surface-600", l: 0.2264 },
  { key: "surface-700", l: 0.2046 },
  { key: "surface-800", l: 0.1822 },
  { key: "surface-900", l: 0.1591 },
  { key: "surface-1000", l: 0.1344 },
];

export const SURFACE_KEYS: string[] = SURFACE_SEED.map((s) => s.key);

export const DEFAULT_ENDPOINTS: SurfaceEndpoints = { cStart: 0, hStart: 0, cEnd: 0, hEnd: 0 };

// Build the 9-point curve array: evenly spaced t (i/8), seeded l.
export function initialPoints(): SurfacePoint[] {
  const n = SURFACE_SEED.length;
  return SURFACE_SEED.map((s, i) => ({ key: s.key, t: i / (n - 1), l: s.l }));
}

// Bucket 2 — other OKLCH @theme ramps (foreground + primary). Full oklch(...) strings.
export const OKLCH_SEED: Record<string, string> = {
  "--color-foreground-50": "oklch(1 0 0)",
  "--color-foreground-100": "oklch(0.9249 0 0)",
  "--color-foreground-200": "oklch(0.7731 0 0)",
  "--color-foreground-300": "oklch(0.696 0 0)",
  "--color-foreground-400": "oklch(0.6167 0 0)",
  "--color-foreground-500": "oklch(0.4962 0 0)",
  "--color-foreground-600": "oklch(0.3904 0 0)",
  "--color-primary-200": "oklch(0.7019 0.1158 46.05)",
  "--color-primary-300": "oklch(0.6789 0.1207 44.39)",
  "--color-primary-400": "oklch(0.6559 0.1262 43.33)",
  "--color-primary-400-10": "oklch(0.6559 0.1262 43.33 / 0.1)",
  "--color-primary-400-50": "oklch(0.6559 0.1262 43.33 / 0.5)",
};

// Bucket 3 — HSL-triplet :root semantic tokens. Bare "H S% L%" (consumed via hsl(var(--x))).
export const HSL_SEED: Record<string, string> = {
  "--background": "0 0% 4%",
  "--foreground": "0 8% 90%",
  "--card": "0 0% 7%",
  "--card-foreground": "240 8% 80%",
  "--popover": "0 0% 8%",
  "--popover-foreground": "0 8% 90%",
  "--primary": "18 59% 55%",
  "--primary-foreground": "16 0% 91%",
  "--secondary": "0 0% 7%",
  "--secondary-foreground": "0 0% 71%",
  "--muted": "240 6% 14%",
  "--muted-foreground": "0 0% 52%",
  "--accent": "232 9% 17%",
  "--accent-foreground": "210 100% 100%",
  "--destructive": "0 60% 50%",
  "--destructive-foreground": "210 40% 98%",
  "--destructive-bright": "0 72% 60%",
  "--success": "142.1 76.2% 36.3%",
  "--success-foreground": "355.7 100% 97.3%",
  "--success-bright": "158 64% 52%",
  "--border": "240 6% 18%",
  "--input": "240 6% 18%",
  "--ring": "212 96% 78%",
  "--chart-1": "220 70% 50%",
  "--chart-2": "160 60% 45%",
  "--chart-3": "30 80% 55%",
  "--chart-4": "280 65% 60%",
  "--chart-5": "340 75% 55%",
  "--sidebar-background": "0 0% 7%",
  "--sidebar-foreground": "240 4.8% 95.9%",
  "--sidebar-primary": "224.3 76.3% 48%",
  "--sidebar-primary-foreground": "0 0% 100%",
  "--sidebar-accent": "240 3.7% 15.9%",
  "--sidebar-accent-foreground": "240 4.8% 95.9%",
  "--sidebar-border": "240 3.7% 15.9%",
  "--sidebar-ring": "217.2 91.2% 59.8%",
  "--tool": "42 93% 46%",
  "--llm": "262 83% 58%",
  "--llm-foreground": "272 100% 74%",
  "--subagent": "187 94% 43%",
};

// ---- pure curve math helpers ----

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

const roundTo = (n: number, d: number): number => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

// Compose a surface stop's oklch(...) string from its point + the global endpoints.
export function computeSurfaceColor(point: SurfacePoint, endpoints: SurfaceEndpoints): string {
  const c = lerp(endpoints.cStart, endpoints.cEnd, point.t);
  const h = lerp(endpoints.hStart, endpoints.hEnd, point.t);
  const l = roundTo(point.l, 4);
  return `oklch(${l} ${roundTo(c, 4)} ${roundTo(h, 2)})`;
}
