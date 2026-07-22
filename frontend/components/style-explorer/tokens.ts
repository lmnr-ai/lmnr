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

// Which curve a generic curve component edits.
export type CurveKey = "surfaceCurve" | "foregroundCurve";

// Bucket 1 — OKLCH @theme surface scale (curve editor target). Lightness seeds,
// ordered surface-100 (base/darkest) .. surface-800 (most elevated/lightest).
export const SURFACE_SEED: { key: string; l: number }[] = [
  { key: "surface-100", l: 0.2046 },
  { key: "surface-200", l: 0.2354 },
  { key: "surface-300", l: 0.2661 },
  { key: "surface-400", l: 0.2969 },
  { key: "surface-500", l: 0.3277 },
  { key: "surface-600", l: 0.3585 },
  { key: "surface-700", l: 0.3892 },
  { key: "surface-800", l: 0.42 },
];

export const SURFACE_KEYS: string[] = SURFACE_SEED.map((s) => s.key);

// Bucket 1b — OKLCH @theme foreground (text) scale. Lightness seeds, ordered 50..600.
export const FOREGROUND_SEED: { key: string; l: number }[] = [
  { key: "foreground-50", l: 1 },
  { key: "foreground-100", l: 0.9249 },
  { key: "foreground-200", l: 0.7731 },
  { key: "foreground-300", l: 0.696 },
  { key: "foreground-400", l: 0.6167 },
  { key: "foreground-500", l: 0.4962 },
  { key: "foreground-600", l: 0.3904 },
];

export const DEFAULT_ENDPOINTS: SurfaceEndpoints = { cStart: 0, hStart: 0, cEnd: 0, hEnd: 0 };

// Build a curve array from a seed: evenly spaced t (i/(n-1)), seeded l.
export function pointsFromSeed(seed: { key: string; l: number }[]): SurfacePoint[] {
  const n = seed.length;
  return seed.map((s, i) => ({ key: s.key, t: i / (n - 1), l: s.l }));
}

export const initialPoints = (): SurfacePoint[] => pointsFromSeed(SURFACE_SEED);
export const initialForegroundPoints = (): SurfacePoint[] => pointsFromSeed(FOREGROUND_SEED);

export const FOREGROUND_KEYS: string[] = FOREGROUND_SEED.map((s) => s.key);
export const PRIMARY_KEYS: string[] = ["primary-200", "primary-300", "primary-400"];

// Semantic @theme tokens that bind to a ramp stop -> their default stop key
// (mirrors the `var(--color-...)` references in globals.css @theme).
export const BINDINGS_SEED: Record<string, string> = {
  background: "surface-100",
  card: "surface-100",
  popover: "surface-100",
  secondary: "surface-200",
  sidebar: "surface-200",
  muted: "surface-200",
  "sidebar-accent": "surface-300",
  accent: "surface-300",
  primary: "primary-400",
  "primary-foreground": "foreground-100",
  "secondary-foreground": "foreground-200",
  "muted-foreground": "foreground-400",
};

export const BINDING_KEYS: string[] = Object.keys(BINDINGS_SEED);

// Grouped stop options shown in the binding dropdowns.
export const STOP_GROUPS: { label: string; keys: string[] }[] = [
  { label: "Surface", keys: SURFACE_KEYS },
  { label: "Text", keys: FOREGROUND_KEYS },
  { label: "Primary", keys: PRIMARY_KEYS },
];

// Bucket 2 — remaining OKLCH @theme ramp (primary). Full oklch(...) strings.
// Foreground stops moved to FOREGROUND_SEED (driven by the text curve).
export const OKLCH_SEED: Record<string, string> = {
  "--color-primary-200": "oklch(0.7019 0.1158 46.05)",
  "--color-primary-300": "oklch(0.6789 0.1207 44.39)",
  "--color-primary-400": "oklch(0.6559 0.1262 43.33)",
  "--color-primary-400-10": "oklch(0.6559 0.1262 43.33 / 0.1)",
  "--color-primary-400-50": "oklch(0.6559 0.1262 43.33 / 0.5)",
};

// Raw hue-named accent palette (bare "H S% L%" triplets). Source of truth for the saturated
// colors; the semantic tokens below alias these in globals.css (destructive→red, chart-3→yellow, …).
// Orange = the OKLCH brand ramp (edited via the primary OKLCH stops), so it's not a raw HSL triplet.
export const RAW_SEED: Record<string, string> = {
  "--red": "0 60% 50%",
  "--yellow": "30 80% 55%",
  "--green": "142.1 76.2% 36.3%",
  "--aqua": "187 94% 43%",
  "--blue": "160 60% 45%",
  "--purple": "262 83% 58%",
  "--pink": "280 65% 60%",
};

export const RAW_KEYS: string[] = Object.keys(RAW_SEED);

// Bucket 3 — HSL-triplet :root tokens. Bare "H S% L%" (consumed via hsl(var(--x))). Raw hues lead;
// the 7 semantic tokens that now alias a raw hue (destructive/success/subagent/llm/chart-2/3/4) are
// omitted — they're edited via their raw hue, not directly.
export const HSL_SEED: Record<string, string> = {
  ...RAW_SEED,
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
  "--destructive-foreground": "210 40% 98%",
  "--destructive-bright": "0 72% 60%",
  "--success-foreground": "355.7 100% 97.3%",
  "--success-bright": "158 64% 52%",
  "--border": "240 6% 18%",
  "--input": "240 6% 18%",
  "--ring": "212 96% 78%",
  "--chart-1": "220 70% 50%",
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
  "--llm-foreground": "272 100% 74%",
};

export const HSL_KEYS: string[] = Object.keys(HSL_SEED);

// ---- HSL triplet helpers (bare "H S% L%" <-> react-colorful {h,s,l}) ----

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function parseHslTriplet(triplet: string | undefined): Hsl {
  if (!triplet) return { h: 0, s: 0, l: 0 };
  const [h, s, l] = triplet.trim().replace(/%/g, "").split(/\s+/).map(Number);
  return { h: h || 0, s: s || 0, l: l || 0 };
}

export function formatHslTriplet({ h, s, l }: Hsl): string {
  const r = (n: number) => Math.round(n * 10) / 10;
  return `${r(h)} ${r(s)}% ${r(l)}%`;
}

// CSS color string for a swatch preview from a bare triplet.
export const hslCss = (triplet: string): string => {
  const { h, s, l } = parseHslTriplet(triplet);
  return `hsl(${h} ${s}% ${l}%)`;
};

// ---- pure curve math helpers ----

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// oklch (L 0..1, C, H°) -> gamma-encoded sRGB [r,g,b] in 0..255, gamut-clipped.
export function oklchToSrgb(L: number, C: number, H: number): [number, number, number] {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return lin.map((x) => {
    const c = clamp(x, 0, 1);
    const g = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(g * 255);
  }) as [number, number, number];
}

// Compose a surface stop's color: build both endpoint colors at this stop's
// lightness, then blend them in gamma-sRGB by t (the common "blue gradient over
// red" behavior — passes through a muddy purple, not green).
export function computeSurfaceColor(point: SurfacePoint, endpoints: SurfaceEndpoints): string {
  const start = oklchToSrgb(point.l, endpoints.cStart, endpoints.hStart);
  const end = oklchToSrgb(point.l, endpoints.cEnd, endpoints.hEnd);
  const [r, g, b] = start.map((s, i) => Math.round(lerp(s, end[i], point.t)));
  return `rgb(${r} ${g} ${b})`;
}
