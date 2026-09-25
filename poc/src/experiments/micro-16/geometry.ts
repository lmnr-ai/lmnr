export const STAGE = {width: 1280, height: 720};
// Exact centerline from Ultimate's white-agent micro-07/spinner.svg (89×89).
export const CHEAP_SPINNER_PATH = 'M87.5 44.5C87.5 20.7518 68.2482 1.5 44.5 1.5C20.7518 1.5 1.5 20.7518 1.5 44.5C1.5 68.2482 20.7518 87.5 44.5 87.5C50.0728 87.5 55.3979 86.4399 60.2848 84.5104';
export const GRID = {pitch: 120, seam: 60, x: -20, y: 61};
export const TRACES = [{x: -140, y: 61}, {x: -20, y: 301}, {x: -260, y: 541}] as const;
export const BASH = {x: 340, y: 1261, width: 360, descent: 2040, paperHeight: 2400};
export const BUDGET_TRACE_Y = 4501;
export const BUDGET = {width: 259, height: 50, marker: 64, markerLag: 14, offsetY: -165};
export const ASSETS = {
  connector: 'e75304ec0bae33695104b69511d595ec6a4944fa.svg',
  tool: 'a2c988a50274dfcda64dc1be086bfac819b6d8b2.svg',
  bashConnector: '69b3f73e529e7d75f68575b3311e0b7634780361.svg',
  bashTool: '3bd5a6ce3763a0d2efc67fe0816ecec6b50d4a81.svg',
  purpleSpinner: '9a28e452b2dd413218b1af8992d0a157b6c76e9c.svg',
  warning: '570bbe8e20385228a85fb9bf175d42a8561a986f.svg',
  dollar: '7d17bbdb9c8e6c17c5e03b4e0a6db6c39e87b368.svg',
  thinkingWarningLeft: 'thinking-warning-left.svg',
  thinkingWarningMiddle: 'thinking-warning-middle.svg',
  thinkingWarningRight: 'thinking-warning-right.svg',
} as const;
// Figma 4779:16756: only the center trace's first Thinking block drops.
export const THINKING_PEEK = {x: 340, y: 301, width: 360, height: 120, drop: 20,
  warningWidth: 81.9405, warningHeight: 76.0943, angle: -20};
const warningRadians = THINKING_PEEK.angle * Math.PI / 180;
// Figma supplies the rotated top-left origin (y=-41), not the bounding-box
// top (-69.025). Convert its center once, then animate around that center.
const centerOffset = {
  x: (THINKING_PEEK.warningWidth * Math.cos(warningRadians) - THINKING_PEEK.warningHeight * Math.sin(warningRadians)) / 2,
  y: (THINKING_PEEK.warningWidth * Math.sin(warningRadians) + THINKING_PEEK.warningHeight * Math.cos(warningRadians)) / 2,
};
export const THINKING_WARNINGS = [
  {originX: 547.953125, asset: ASSETS.thinkingWarningRight},
  {originX: 475.06640625, asset: ASSETS.thinkingWarningMiddle},
  {originX: 400.69921875, asset: ASSETS.thinkingWarningLeft},
].map(warning => ({asset: warning.asset, x: TRACES[1].x + warning.originX + centerOffset.x,
  y: TRACES[1].y - 41 + centerOffset.y}));
// Figma's 300px Bash is intentionally a half-cell width, not 3×120.
export const BLOCKS = [
  {x: 0, width: 240, label: 'Write'},
  {x: 240, width: 120, asset: ASSETS.connector},
  {x: 360, width: 360, label: 'Thinking...'},
  {x: 720, width: 120, asset: ASSETS.tool},
  {x: 840, width: 300, label: 'Bash'},
  {x: 1140, width: 120, asset: ASSETS.connector},
  {x: 1260, width: 360, label: 'Thinking...'},
] as const;
export const TRACE_PERIOD = 1620;
export const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const smoothstep = (n: number) => {const p = clamp(n); return p * p * (3 - 2 * p);};
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
// Keep the circle's left edge on the track so near-empty red remains visible
// above/below its curved edge; preserve Figma's x130 center at 144px fill.
export const markerCenter = (remaining: number) => Math.max(BUDGET.marker / 2, Math.min(BUDGET.width, BUDGET.width * remaining - BUDGET.markerLag));
