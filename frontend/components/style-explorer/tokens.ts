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
  { key: "surface-100", l: 0.1879 },
  { key: "surface-200", l: 0.2181 },
  { key: "surface-300", l: 0.2483 },
  { key: "surface-400", l: 0.2785 },
  { key: "surface-500", l: 0.3088 },
  { key: "surface-600", l: 0.339 },
  { key: "surface-700", l: 0.3692 },
  { key: "surface-800", l: 0.3994 },
];

export const SURFACE_KEYS: string[] = SURFACE_SEED.map((s) => s.key);

// Bucket 1b — OKLCH @theme foreground (text) scale. Lightness seeds, ordered 50..600.
export const FOREGROUND_SEED: { key: string; l: number }[] = [
  { key: "foreground-50", l: 1 },
  { key: "foreground-100", l: 0.891 },
  { key: "foreground-200", l: 0.782 },
  { key: "foreground-300", l: 0.673 },
  { key: "foreground-400", l: 0.564 },
  { key: "foreground-500", l: 0.455 },
  { key: "foreground-600", l: 0.346 },
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
  "--red": "0 100% 63.1%",
  "--yellow": "28.2 100% 45.5%",
  "--green": "152.8 100% 34.1%",
  "--aqua": "178.6 100% 34.3%",
  "--blue": "216.1 100% 60.6%",
  "--purple": "259.9 100% 68.6%",
  "--pink": "325.8 100% 60.8%",
};

export const RAW_KEYS: string[] = Object.keys(RAW_SEED);

// Bucket 3 — HSL-triplet :root tokens. Bare "H S% L%" (consumed via hsl(var(--x))). The semantic
// tokens that now alias a raw hue — destructive/success/subagent/llm and ALL five charts — are
// omitted (editing them here would override the alias); the raw hues live in the OKLCH accent
// bucket (#9), not here.
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
  "--destructive-foreground": "210 40% 98%",
  "--success-foreground": "355.7 100% 97.3%",
  "--border": "240 6% 18%",
  "--input": "240 6% 18%",
  "--ring": "212 96% 78%",
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

// ---- #11 edge-treatment configurator ----
// UNWIRE: three swappable rim looks for raised surfaces. Each bundle sets the four :root edge
// alphas (see globals.css). To commit to one variant, inline its numbers and delete this map + the
// explorer control + the `edge` state bucket. Micka alphas start from the fluidfunctionalism recipe
// (top highlight / inner white ~2-6%, outer black ~12-22%) and are tunable via the sliders.
export type EdgeVariant = "none" | "border" | "micka";

export interface EdgeState {
  variant: EdgeVariant;
  highlight: number; // white top-highlight inset (Micka)
  inner: number; // white inner ring inset (Micka)
  outer: number; // black outer ring (Micka)
  border: number; // flat white rim on raised surfaces (Border)
}

export const EDGE_VARIANTS: Record<EdgeVariant, Omit<EdgeState, "variant">> = {
  none: { highlight: 0, inner: 0, outer: 0, border: 0 },
  border: { highlight: 0, inner: 0, outer: 0, border: 0.04 },
  micka: { highlight: 0.05, inner: 0.05, outer: 0.18, border: 0 },
};

export const DEFAULT_EDGE_VARIANT: EdgeVariant = "micka";

export const seedEdge = (): EdgeState => ({ variant: DEFAULT_EDGE_VARIANT, ...EDGE_VARIANTS[DEFAULT_EDGE_VARIANT] });

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
  return oklchToLinearSrgb(L, C, H).map((x) => {
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

// ---- OKLCH accent-curve helpers (#9) ----

// oklch (L 0..1, C, H°) -> linear-sRGB [r,g,b] WITHOUT gamut clipping, so callers can tell
// whether the color falls outside sRGB (any channel <0 or >1).
function oklchToLinearSrgb(L: number, C: number, H: number): [number, number, number] {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

// True when the oklch triple lands inside sRGB (before clamping).
export function oklchInGamut(L: number, C: number, H: number): boolean {
  const eps = 0.0005;
  return oklchToLinearSrgb(L, C, H).every((v) => v >= -eps && v <= 1 + eps);
}

// Highest lightness that stays in sRGB for a given chroma+hue, used to draw the gamut ceiling.
// The in-gamut lightness for a fixed chroma/hue is a BAND [Lmin, Lmax] (black isn't in gamut at
// nonzero chroma), so a naive [0,1] bisection is wrong — scan from white downward and return the
// first in-gamut L (the ceiling), then refine.
export function maxLInGamut(C: number, H: number): number {
  for (let L = 1; L >= 0; L -= 0.01) {
    if (oklchInGamut(L, C, H)) {
      let lo = L;
      let hi = Math.min(1, L + 0.01);
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (oklchInGamut(mid, C, H)) lo = mid;
        else hi = mid;
      }
      return lo;
    }
  }
  return 0;
}

const gammaToLin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

// gamma sRGB (0..255) -> oklch {L, C, H°}. Inverse of oklchToSrgb.
export function srgbToOklch(r: number, g: number, b: number): { L: number; C: number; H: number } {
  const lr = gammaToLin(r / 255);
  const lg = gammaToLin(g / 255);
  const lb = gammaToLin(b / 255);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

// hsl triplet {h, s%, l%} -> gamma sRGB (0..255).
export function hslToSrgb({ h, s, l }: Hsl): [number, number, number] {
  const S = s / 100;
  const Lp = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const aa = S * Math.min(Lp, 1 - Lp);
  const f = (n: number) => Lp - aa * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// gamma sRGB (0..255) -> bare "H S% L%" triplet (so oklch picks store like every other :root token).
export function srgbToHslTriplet(r: number, g: number, b: number): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return `${r1(h)} ${r1(s * 100)}% ${r1(l * 100)}%`;
}

// oklch -> bare "H S% L%" triplet (gamut-clamped through oklchToSrgb).
export function oklchToHslTriplet(L: number, C: number, H: number): string {
  const [r, g, b] = oklchToSrgb(L, C, H);
  return srgbToHslTriplet(r, g, b);
}

// Catmull-Rom spline value at x, over points sorted by x. Flat-extrapolates past the ends.
// Used to draw the smooth "cubic" accent lightness curve and to sample L at any hue.
export function catmullRom(points: { x: number; y: number }[], x: number): number {
  const pts = [...points].sort((a, b) => a.x - b.x);
  if (pts.length === 0) return 0;
  if (x <= pts[0].x) return pts[0].y;
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
  let i = 0;
  while (i < pts.length - 1 && pts[i + 1].x < x) i++;
  const p0 = pts[i - 1] ?? pts[i];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[i + 2] ?? p2;
  const t = (x - p1.x) / (p2.x - p1.x || 1);
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  );
}

// ---- OKLCH accent family state (#9) ----
// A single cubic lightness-by-hue curve (draggable anchors) + one vertical line per raw hue
// (movable in hue only). Each color is sampled where its line crosses the curve: L = curve(hue),
// chroma = shared chroma + the color's nudge.
export interface AccentCurvePoint {
  hue: number; // X, 0..360
  l: number; // Y, OKLCH lightness 0..1
}

export interface AccentColor {
  key: string; // the raw token, e.g. "--red"
  hue: number; // OKLCH hue 0..360 (the vertical line position)
  nudge: number; // per-hue chroma delta added to the shared chroma
}

export interface AccentState {
  chroma: number; // shared OKLCH chroma
  curve: AccentCurvePoint[]; // the draggable cubic (independent of the color lines)
  colors: AccentColor[];
}

// Baked default accent family (the tuned state committed as the app default). The editor opens
// on this; applyState feeds curve+hue+nudge through oklchToHslTriplet to produce --red..--pink,
// which must match the RAW_SEED triplets and the globals.css :root values.
export function seedAccent(): AccentState {
  return {
    chroma: 0.24,
    curve: [
      { hue: 0, l: 0.6767810833400886 },
      { hue: 143.30152279055136, l: 0.6524937040062071 },
      { hue: 252.21432240118202, l: 0.6612130678741169 },
      { hue: 356.1764685409278, l: 0.6999270434476365 },
    ],
    colors: [
      { key: "--red", hue: 25.862511090201107, nudge: -0.01 },
      { key: "--yellow", hue: 60.57993248294484, nudge: -0.03975955678600182 },
      { key: "--green", hue: 156.4626453262263, nudge: -0.06 },
      { key: "--aqua", hue: 191.89973754483782, nudge: -0.06368383627492008 },
      { key: "--blue", hue: 262.04932403807396, nudge: 0.0031893895758517976 },
      { key: "--purple", hue: 286.48180485809144, nudge: 0.055674010109454636 },
      { key: "--pink", hue: 354.0410237236758, nudge: 0.017965258931504635 },
    ],
  };
}
