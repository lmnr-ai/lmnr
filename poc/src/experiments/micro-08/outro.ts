import {CELL, ROWS, TILE_PERIOD} from './geometry';

// Figma4730:15806: 1280×720, 16 columns, 80px cells, 20px white dots.
// Requested adaptation: seven rows instead of nine, centered vertically.
export const DOT_GRID = {columns: 16, rows: 7, spacing: 80, diameter: 20, x: 40, y: 120};
// Figma4730:16372: final dot fill (opaque, not reduced opacity).
export const DOT_DIM_COLOR = '#4e4e4e';
export const OUTRO_KEYS = ['dotPosition', 'dotShrink', 'loaderStroke', 'backdropFade', 'streamerExit', 'gridSlide', 'dotDim'] as const;
export type OutroKey = typeof OUTRO_KEYS[number];
export type OutroProgress = Record<OutroKey, number>;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mix = (a: number, b: number, progress: number) => a + (b - a) * clamp(progress);
export const INITIAL_OUTRO: OutroProgress = {
  dotPosition: 0, dotShrink: 0, loaderStroke: 0, backdropFade: 0, streamerExit: 0, gridSlide: 0, dotDim: 0,
};
export function readOutro(read: (key: OutroKey) => number): OutroProgress {
  return Object.fromEntries(OUTRO_KEYS.map(key => [key, clamp(read(key))])) as OutroProgress;
}

// The original spinner's exact path. Inline SVG exposes its real stroke width;
// fading an <image> or swapping in a second dot would not perform this morph.
export const LOADER_PATH = 'M37 19C37 9.05887 28.9411 1 19 1C9.05887 1 1 9.05887 1 19C1 28.9411 9.05887 37 19 37C21.3328 37 23.5619 36.5562 25.6076 35.7485';

export function rowPose(index: number, outro: OutroProgress = INITIAL_OUTRO) {
  const source = ROWS[index];
  const diameter = mix(CELL, DOT_GRID.diameter, outro.dotShrink);
  return {
    x: mix(source.agent.x, DOT_GRID.x, outro.dotPosition),
    y: mix(source.agent.y, DOT_GRID.y + index * DOT_GRID.spacing, outro.dotPosition),
    radius: diameter / 2,
    // Scale ribbons, words and icons with their head, without squeezing only y.
    scale: diameter / CELL,
    loaderStrokeWidth: 2 * (1 - clamp(outro.loaderStroke)),
    streamOpacity: 1 - clamp(outro.streamerExit),
  };
}
export function ribbonPatternX(pose: ReturnType<typeof rowPose>, stripPhase: number) {
  // The clock never stops when the position clip ends. Phase is still advancing
  // while landed ribbons finish streaming and fade out.
  return pose.x - (TILE_PERIOD + stripPhase) * pose.scale;
}

// Column zero is deliberately absent: those seven circles ARE the live agents.
export const OTHER_DOTS = Array.from({length: DOT_GRID.columns - 1}, (_, column) =>
  Array.from({length: DOT_GRID.rows}, (_, row) => ({
    column: column + 1, row,
    x: DOT_GRID.x + (column + 1) * DOT_GRID.spacing,
    y: DOT_GRID.y + row * DOT_GRID.spacing,
  }))).flat();
export function gridColumnProgress(column: number, progress: number) {
  // Linear master clock → independent eased column entrances. The first40%
  // of the clip staggers starts; each column travels over the remaining60%.
  const delay = (column - 1) / (DOT_GRID.columns - 2) * .4;
  const local = clamp((clamp(progress) - delay) / .6);
  return local * local * (3 - 2 * local);
}
export function gridDotPose(dot: typeof OTHER_DOTS[number], progress: number) {
  // All seven dots in a column move together. Later columns trail earlier
  // ones without crossing; size/opacity stay constant throughout the slide.
  const entrance = gridColumnProgress(dot.column, progress);
  return {x: dot.x + 1280 * (1 - entrance), y: dot.y, radius: DOT_GRID.diameter / 2, opacity: 1};
}
export function dotFill(progress: number) {
  const target = parseInt(DOT_DIM_COLOR.slice(1, 3), 16);
  const channel = Math.round(mix(255, target, progress)).toString(16).padStart(2, '0');
  return `#${channel.repeat(3)}`;
}
