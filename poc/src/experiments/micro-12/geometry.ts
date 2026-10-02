import {BLOCKS as ORIGINAL_BLOCKS, CELL, type Block} from '../micro-07/geometry';
import {MICRO_09_DURATION} from '../micro-09/timeline';
import {sampleMicro09} from '../micro-09/sample';
import type {Playback} from './sample';
export {CELL};

export const GRID = {pitch: 4800, finalPitch: 100, columns: 15, rows: 9};
export const CELLS = Array.from({length: GRID.columns * GRID.rows}, (_, index) => ({
  id: index, x: (index % GRID.columns - 7) * GRID.pitch, y: (Math.floor(index / GRID.columns) - 4) * GRID.pitch,
  hero: index === 67,
}));
// Borrow the authored straight run, NOT Animation 7's route/elbow/camera.
export const BLOCK_TEMPLATE: Block[] = [
  ...ORIGINAL_BLOCKS.slice(0, 9).map(block => ({...block, x: block.x - 540, y: -60})),
  {id: 'separator', x: 1860, y: -60, w: CELL, h: CELL, asset: 'icon-c.svg'},
];
export const PERIOD = 2040;
export const DEFAULTS = {streamerSpeed: 660, loaderSpeed: 1.9, streamSeed: 209, maxZoom: 31.75, cloudEntrySpread: 700, introCameraOffsetCells: .75, openingCloudBackXOffset: 150, openingCloudFrontXOffset: 129, footballSmokeMinOpacity: 0, warningXOffset: 180, warningYOffset: -180};
export type Controls = typeof DEFAULTS;
export const HERO_CLIP_LEFT = -GRID.pitch * GRID.columns;
// Figma 4741:28865, converted from stage coordinates to hero-world coordinates.
export const OPENING_CLOUDS = {
  back: {x: -512.75, y: -319.06, width: 1025.5, height: 576.124},
  front: {x: -69.58, y: -13.61, width: 508.578, height: 285.718},
} as const;
export const openingCloudX = (layer: keyof typeof OPENING_CLOUDS, head: number, xOffset = 0) => OPENING_CLOUDS[layer].x - head + xOffset;
export const openingCloudBounds = (layer: keyof typeof OPENING_CLOUDS, head: number, scale: number, xOffset = 0) => {
  const cloud = OPENING_CLOUDS[layer];
  const width = cloud.width * scale;
  const height = cloud.height * scale;
  return {
    x: openingCloudX(layer, head, xOffset) + (cloud.width - width) / 2,
    y: cloud.y + (cloud.height - height) / 2,
    width,
    height,
  };
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const mod = (n: number, d: number) => ((n % d) + d) % d;
export function offsetForCell(seed: number, cell: number) {
  let x = (Math.round(seed) ^ Math.imul(cell + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 2 ** 32 * PERIOD;
}

export function worldState(playback: Playback, controls: Controls = DEFAULTS) {
  const p = playback.progress;
  const streamSeconds = clamp(p.streamRun) * playback.streamDuration;
  const head = 300 * clamp(p.firstThinking) + streamSeconds * controls.streamerSpeed;
  const finalHead = 300 + playback.streamDuration * controls.streamerSpeed;
  // Pick the latest FULLY VISITED blue/read/red trio, not a repeating SVG tile.
  // REVIEW(short-run): very short streamRun clips may not reach all three doors.
  const liftCycle = Math.max(0, Math.floor((finalHead - 1140) / PERIOD));
  const liftCenter = liftCycle * PERIOD + 120;
  const focus = (liftCenter - finalHead) * clamp(p.cameraBacktrack);
  // REVIEW(direction): negative camera focus places the stationary hero to the
  // right on screen. If art direction changes sides, change this sign only.
  const introCameraFocus = -CELL * controls.introCameraOffsetCells
    * clamp(p.firstThinking) * (1 - clamp(p.cameraCenterAgent));
  const flight = clamp(p.footballOut) * (1 - clamp(p.footballBack));
  const finalZoom = clamp(p.finalZoom);
  const scale = Math.max(1, controls.maxZoom) ** (-flight * (1 - finalZoom)) * (GRID.finalPitch / GRID.pitch) ** finalZoom;
  // Uniform correction shared by blocks, small grid, and agent: 120px -> 12px.
  const contentScale = (1 / scale) ** (1 - Math.log(10) / Math.log(GRID.pitch / GRID.finalPitch));
  const gray = Math.round(255 - 177 * clamp(p.dotDim));
  const centerShade = Math.round(26 + (51 - 26) * flight);
  const warningProgress = clamp(p.warningEnter);
  const warningStart = {x: focus + controls.warningXOffset, y: controls.warningYOffset};
  // Rebase the completed lifted scene into the standard center-cell frame.
  // This keeps downstream grid geometry unchanged while replacing its original
  // agent at world origin with the warning before final zoom begins.
  const rebaseProgress = clamp(p.warningFocus);
  const heroRebase = {x: -warningStart.x * rebaseProgress, y: -warningStart.y * rebaseProgress};
  const warningPosition = {x: warningStart.x + heroRebase.x, y: warningStart.y + heroRebase.y};
  // Intro focus and later backtrack do not overlap in the authored timeline.
  // Addition keeps the camera seam composable if timings are tuned slightly.
  const cameraFocus = (introCameraFocus + focus) * (1 - rebaseProgress);
  const cameraFocusY = 0;
  const gridOrigin = {x: 0, y: 0};
  const warningFinalSizeScale = 25.41796875 / (114.269 * .1);
  const contentHalfCell = GRID.pitch / (2 * contentScale);
  // Once rebased, final-zoom clipping is safe: the boundary begins far outside
  // the viewport and enters naturally as the camera pulls back.
  const constrainHeroToCell = flight > 0 || finalZoom > 0;
  const heroClip = finalZoom > 0
    ? {x: -contentHalfCell - heroRebase.x, width: contentHalfCell * 2}
    : constrainHeroToCell
      ? {x: -contentHalfCell, width: contentHalfCell}
      : {x: HERO_CLIP_LEFT, width: -HERO_CLIP_LEFT};
  return {
    head, liftCycle, focus, introCameraFocus, cameraFocus, cameraFocusY, gridOrigin, heroRebase, scale, contentScale,
    streamVisible: clamp(p.agentEnter) >= 1 - 1e-6,
    heroClipLeft: heroClip.x,
    heroClipWidth: heroClip.width,
    warning: {
      scale: warningProgress * contentScale * (1 + (warningFinalSizeScale - 1) * finalZoom),
      x: warningPosition.x,
      y: warningPosition.y,
    },
    heroAgentOpacity: 1 - finalZoom,
    centerCellColor: `rgb(${centerShade}, ${centerShade}, ${centerShade})`,
    smokeOpacity: 1 - (1 - controls.footballSmokeMinOpacity) * flight,
    agentScale: clamp(p.agentEnter), loaderAngle: mod(playback.time * controls.loaderSpeed * 360, 360),
    streamHeight: 1 - clamp(p.streamCollapse), loaderOpacity: 1 - clamp(p.loaderFade),
    smallGridOpacity: 1 - clamp(p.smallGridFade),
    smallGridUbiquitous: p.cameraBacktrack > 0 || finalZoom > 0,
    dotColor: `rgb(${gray}, ${gray}, ${gray})`,
    // Football shows live neighbors. By the final zoom, neighbors are gray dots.
    neighborsAreDots: p.cameraBacktrack > 0 || p.finalZoom > 0,
    bigGridVisible: flight > 0 || finalZoom > 0,
    // The cloud bridge is separate; the actual finale reuses Animation 9 verbatim.
    cloudEnter: clamp(p.cloudEnter),
    cloudTranslateX: [-controls.cloudEntrySpread * (1 - clamp(p.cloudEnter)), controls.cloudEntrySpread * (1 - clamp(p.cloudEnter))] as [number, number],
    finale: sampleMicro09(clamp(p.finale) * MICRO_09_DURATION),
    gridBlend: clamp((p.cloudEnter - .75) / .25),
    shortRun: finalHead < 1140,
  };
}
export type WorldState = ReturnType<typeof worldState>;

export function visibleBlocks(head: number, left: number, right: number, liftCycle: number) {
  // Bounded by viewport, not total elapsed streaming time. No ever-growing history.
  const first = Math.max(0, Math.floor((left + head) / PERIOD) - 1);
  const last = Math.max(first, Math.ceil((right + head) / PERIOD));
  return Array.from({length: last - first + 1}, (_, index) => first + index).flatMap(cycle =>
    BLOCK_TEMPLATE.map(block => ({...block, key: `${cycle}-${block.id}`, x: block.x + cycle * PERIOD - head,
      first: cycle === 0 && block.id === 'thinking-blue',
      lift: cycle === liftCycle && ['thinking-blue', 'read', 'thinking-red'].includes(block.id),
    })).filter(block => block.x < 0 && block.x + block.w > left && block.x < right));
}
