import {BLOCKS, CELL, ELBOW, STRAIGHT_LENGTH, VERTICAL_LENGTH, blockOutline, type Block} from '../micro-07/geometry';
import {blockReveal, type BlockReveal} from '../micro-07/routeMask';
import {BLOCK_TEMPLATE, GRID, CELLS, PERIOD, OPENING_CLOUDS, openingCloudBounds, openingCloudX} from '../micro-12/geometry';
import type {Playback} from './sample';
import {STREAM_BLOCKS_REMOVED, STREAM_DISTANCE_REMOVED, STREAM_SPEED} from './stream-trim';
export {CELL, GRID, CELLS, PERIOD, BLOCK_TEMPLATE, OPENING_CLOUDS, openingCloudBounds, openingCloudX};

export const DEFAULTS = {streamerSpeed: STREAM_SPEED, loaderSpeed: 1.9, cloudEntrySpread: 700,
  introCameraOffsetCells: .75, openingCloudBackXOffset: 150, openingCloudFrontXOffset: 129,
  warningXOffset: 180, warningYOffset: -180};
export type Controls = typeof DEFAULTS;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const mod = (n: number, d: number) => ((n % d) + d) % d;
export const TURN_BLOCKS = BLOCKS.slice(BLOCKS.findIndex(block => block.id === 'later-thinking-blue'));
const names: Record<string, string> = {'later-thinking-blue': 'thinking-blue', 'later-read': 'read', 'later-thinking-red': 'thinking-red'};

// Finish the uninterrupted repeating stream, then reach the next complete
// blue/Read/red trio. The elbow replaces its next icon, never a visited block.
export function routeLayout(streamDuration: number, speed: number) {
  const runEnd = 300 + Math.max(0, streamDuration) * Math.max(0, speed);
  // Choose the same authored route as before the trim, then close the exact
  // distance occupied by the fourteen removed blocks. This preserves agent
  // velocity and the remaining approach distance into the upward handoff.
  const virtualRunEnd = runEnd + STREAM_DISTANCE_REMOVED;
  const liftCycle = Math.max(0, Math.ceil((virtualRunEnd - 1200) / PERIOD));
  const elbowX = liftCycle * PERIOD + 1200 - STREAM_DISTANCE_REMOVED;
  const straightBlockCount = Math.max(0, liftCycle * BLOCK_TEMPLATE.length - STREAM_BLOCKS_REMOVED);
  return {runEnd, liftCycle, straightBlockCount, elbowX, liftCenter: elbowX - 1080,
    tailOffsetX: elbowX - ELBOW.x};
}

export function worldState(playback: Playback, controls: Controls = DEFAULTS) {
  const p = playback.progress;
  const route = routeLayout(playback.streamDuration, controls.streamerSpeed);
  const head = 300 * clamp(p.firstThinking) + clamp(p.streamRun) * playback.streamDuration * Math.max(0, controls.streamerSpeed)
    + (route.elbowX - route.runEnd) * clamp(p.continueStraight);
  const rise = VERTICAL_LENGTH * clamp(p.upwardTurn);
  const focus = (route.liftCenter - head) * clamp(p.cameraBacktrack);
  const introCameraFocus = -CELL * controls.introCameraOffsetCells * clamp(p.firstThinking) * (1 - clamp(p.cameraCenterAgent));
  const finalZoom = clamp(p.finalZoom);
  // The only zoom in Ultimate 2. Before finalZoom, this is exactly one.
  const scale = (GRID.finalPitch / GRID.pitch) ** finalZoom;
  const contentScale = (1 / scale) ** (1 - Math.log(10) / Math.log(GRID.pitch / GRID.finalPitch));
  const warningStart = {x: route.liftCenter - head + controls.warningXOffset, y: controls.warningYOffset};
  const rebaseProgress = clamp(p.warningFocus);
  const heroRebase = {x: -warningStart.x * rebaseProgress, y: -warningStart.y * rebaseProgress};
  const warningPosition = {x: warningStart.x + heroRebase.x, y: warningStart.y + heroRebase.y};
  const cameraFocus = (introCameraFocus + focus) * (1 - rebaseProgress);
  const warningFinalSizeScale = 25.41796875 / (114.269 * .1);
  const halfCell = GRID.pitch / (2 * contentScale);
  const gray = Math.round(255 - 177 * clamp(p.dotDim));
  return {
    ...route, head, rise, distance: head + rise, focus, introCameraFocus, cameraFocus, cameraFocusY: 0,
    heroRebase, scale, contentScale, gridOrigin: {x: 0, y: 0},
    heroClip: finalZoom > 0 ? {x: -halfCell - heroRebase.x, y: -halfCell - heroRebase.y,
      width: halfCell * 2, height: halfCell * 2} : null,
    streamVisible: clamp(p.agentEnter) >= 1 - 1e-6,
    warning: {scale: clamp(p.warningEnter) * contentScale * (1 + (warningFinalSizeScale - 1) * finalZoom), ...warningPosition},
    agentY: -rise, heroAgentOpacity: 1 - finalZoom, agentScale: clamp(p.agentEnter),
    loaderAngle: mod(playback.time * controls.loaderSpeed * 360, 360),
    streamHeight: 1 - clamp(p.streamCollapse), loaderOpacity: 1 - clamp(p.loaderFade),
    smallGridOpacity: 1 - clamp(p.smallGridFade), dotColor: `rgb(${gray}, ${gray}, ${gray})`,
    bigGridVisible: finalZoom > 0,
    cloudEnter: clamp(p.cloudEnter),
    cloudTranslateX: [-controls.cloudEntrySpread * (1 - clamp(p.cloudEnter)), controls.cloudEntrySpread * (1 - clamp(p.cloudEnter))] as [number, number],
    // Cover pose only: never sample/play Animation 9 or its downward exit.
    cloudProgress: 0, cloudTranslateY: 720 * (1 - clamp(p.cloudEnter)),
  };
}
export type WorldState = ReturnType<typeof worldState>;
/** Hero-agent horizontal position after the same camera and hero transforms used by World. */
export const agentScreenPan = (state: WorldState) => Math.max(-1, Math.min(1,
  ((640 - state.cameraFocus * state.scale + state.heroRebase.x * state.contentScale * state.scale) - 640) / 640));
export type RouteBlock = Block & {key: string; first: boolean; lift: boolean; reveal: BlockReveal; outline?: string};
const translatedReveal = (region: BlockReveal, dx: number): BlockReveal => ({complete: region.complete,
  rects: region.rects.map(rect => ({...rect, x: rect.x + dx, y: rect.y - 300})),
  circles: region.circles.map(circle => ({...circle, cx: circle.cx + dx, cy: circle.cy - 300}))});

// Bounded viewport lookup; the tail uses 7's exact masks in its original
// coordinates, translated with the same world camera (including during lifts).
export function visibleRouteBlocks(s: WorldState, left: number, right: number): RouteBlock[] {
  const straight = Array.from({length: s.liftCycle}, (_, cycle) => cycle).flatMap(cycle =>
    BLOCK_TEMPLATE.map(block => {
      const x = block.x + cycle * PERIOD - s.head;
      const width = Math.max(0, Math.min(block.w, -x));
      return {...block, x, key: `${cycle}-${block.id}`, first: cycle === 0 && block.id === 'thinking-blue', lift: false,
        reveal: {rects: width > 0 ? [{x, y: block.y, width, height: block.h}] : [], circles: [], complete: width === block.w}};
    })).slice(0, s.straightBlockCount).filter(block => block.x + block.w > left && block.x < right);
  const dx = s.tailOffsetX - s.head;
  const tail = TURN_BLOCKS.map(block => ({...block, id: names[block.id] ?? block.id,
    x: block.x + dx, y: block.y - 300, key: `tail-${block.id}`,
    first: s.straightBlockCount === 0 && block.id === 'later-thinking-blue', lift: block.id in names,
    outline: block.asset ? blockOutline(block) : undefined,
    reveal: translatedReveal(blockReveal(block, s.distance - (s.elbowX - STRAIGHT_LENGTH)), dx),
  }));
  return [...straight, ...tail].filter(block => block.x + block.w > left && block.x < right
    && (block.reveal.rects.length > 0 || block.reveal.circles.length > 0));
}
