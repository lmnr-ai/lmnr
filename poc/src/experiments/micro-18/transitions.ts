import {introducingFlowState, type IntroducingFlowState} from '../introducing-flow-1/geometry';
import type {FlowPlayback} from '../introducing-flow-1/sample';
import type {Flow2Playback} from '../introducing-flow-1-2/sample';
import {flow2WorldState} from '../introducing-flow-1-2/geometry';

export type Point = {x: number; y: number};
export type SharedCamera = Point & {scale: number};
export type ScreenTransform = Point & {scale: number};

/** The only lattice used by Cost and Flow in Animation 18. */
export const CANONICAL_GRID = {pitch: 100, origin: {x: 0, y: 0}} as const;

// Micro16's SVG pattern paints vertical centers at -19.5 + 120k and
// horizontal centers at 60.5 + 120k. Convert those exact stroke centers to
// the canonical 100-unit lattice rather than matching an approximate phase.
export const COST_NATIVE_TO_WORLD = {
  scale: 5 / 6,
  x: 19.5 * 5 / 6,
  y: -60.5 * 5 / 6,
} as const;

// Historical placement. Current voiceover cuts derive a grid-aligned placement
// from the actual Cost endpoint instead of equating translateX across zoom levels.
export const FLOW_PLACEMENT = {x: 1200, y: 4800} as const;

export const costPointToWorld = (point: Point): Point => ({
  x: COST_NATIVE_TO_WORLD.x + point.x * COST_NATIVE_TO_WORLD.scale,
  y: COST_NATIVE_TO_WORLD.y + point.y * COST_NATIVE_TO_WORLD.scale,
});

export const flowPointToWorld = (point: Point): Point => ({
  x: FLOW_PLACEMENT.x + point.x,
  y: FLOW_PLACEMENT.y + point.y,
});

/** Convert Micro16's native `translate(-camera)` projection to the shared world. */
export const costCameraInSharedWorld = (camera: Point): SharedCamera => {
  const scale = 1 / COST_NATIVE_TO_WORLD.scale;
  return {
    x: -camera.x - COST_NATIVE_TO_WORLD.x * scale,
    y: -camera.y - COST_NATIVE_TO_WORLD.y * scale,
    scale,
  };
};

export type FlowWorldLayout = {
  placement: Point;
  openingCenterOffset: number;
  openingZoom: number;
  openingBenchmark: number;
};

/** Keep the viewport center on the same world column across the entry zoom.
 * Snap content to whole cells, then absorb the sub-cell remainder in the camera.
 * The layout is computed from fixed endpoints, never from the moving Cost frame.
 */
export function createFlowWorldLayout(costCamera: Point, opening: Flow2Playback): FlowWorldLayout {
  const outgoing = costCameraInSharedWorld(costCamera);
  const incoming = flow2WorldState(opening).camera;
  const costCenter = (640 - outgoing.x) / outgoing.scale;
  const nativeCenter = (640 - incoming.x) / incoming.scale;
  const exactX = costCenter - nativeCenter;
  const x = Math.round(exactX / CANONICAL_GRID.pitch) * CANONICAL_GRID.pitch;
  return {placement: {x, y: FLOW_PLACEMENT.y}, openingCenterOffset: x - exactX,
    openingZoom: opening.progress.cameraZoom, openingBenchmark: opening.progress.cameraToBenchmark};
}

/** Compose the native camera with its placement. The small entry correction
 * follows actual authored progress and disappears by the settled benchmark.
 * Omitting layout preserves the historical cut exactly.
 */
export const flowCameraInSharedWorld = (camera: IntroducingFlowState['camera'], layout?: FlowWorldLayout, playback?: Flow2Playback): SharedCamera => {
  const placement = layout?.placement ?? FLOW_PLACEMENT;
  let correction = 0;
  if (layout) {
    const zoom = Math.abs(1 - layout.openingZoom) > 1e-6;
    const start = zoom ? layout.openingZoom : layout.openingBenchmark;
    const current = playback ? (zoom ? playback.progress.cameraZoom : playback.progress.cameraToBenchmark) : start;
    const weight = Math.abs(1 - start) > 1e-6 ? Math.max(0, Math.min(1, (1 - current) / (1 - start))) : 1;
    correction = layout.openingCenterOffset * camera.scale * weight;
  }
  return {x: camera.x - placement.x * camera.scale + correction,
    y: camera.y - placement.y * camera.scale, scale: camera.scale};
};

const lerp = (a: number, b: number, progress: number) => a + (b - a) * progress;
export const interpolateCamera = (from: SharedCamera, to: SharedCamera, progress: number): SharedCamera => {
  const p = Math.max(0, Math.min(1, progress));
  return {x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p), scale: lerp(from.scale, to.scale, p)};
};

/** One camera only: frozen Cost endpoint → Flow opening, then native Flow camera. */
export const sharedWorldCamera = ({entryProgress, outgoingCostCamera, flowPlayback, flowPlayback21, flowLayout}: {
  entryProgress: number;
  outgoingCostCamera: Point;
  flowPlayback: FlowPlayback;
  flowPlayback21?: Flow2Playback;
  flowLayout?: FlowWorldLayout;
}): SharedCamera => {
  const flow = flowCameraInSharedWorld((flowPlayback21 ? flow2WorldState(flowPlayback21) : introducingFlowState(flowPlayback)).camera, flowLayout, flowPlayback21);
  if (entryProgress >= 1) return flow;
  // Source21's native clock is held at zero throughout the entry bridge.
  // Its authored camera.from values are already reflected in this pose;
  // replacing them with source13's zero-progress pose would snap on arrival.
  if (flowPlayback21) return interpolateCamera(costCameraInSharedWorld(outgoingCostCamera), flow, entryProgress);
  const openingPlayback: FlowPlayback = {
    ...flowPlayback,
    time: 0,
    progress: Object.fromEntries(Object.keys(flowPlayback.progress).map(key => [key, key === 'cloudReveal' ? 1 : 0])) as FlowPlayback['progress'],
  };
  return interpolateCamera(costCameraInSharedWorld(outgoingCostCamera), flowCameraInSharedWorld(introducingFlowState(openingPlayback).camera), entryProgress);
};

/**
 * During the bridge, Flow's source screen-space cloud plane is temporarily
 * projected as if it were fixed to the Flow opening section in shared-world
 * coordinates. At the Flow opening camera this affine transform is identity,
 * allowing an exact handoff back to Animation13's normal screen attachment.
 */
export const flowCloudScreenTransform = (
  entryProgress: number,
  camera: SharedCamera,
  flowOpeningCamera: SharedCamera,
): ScreenTransform => {
  if (entryProgress >= 1) return {x: 0, y: 0, scale: 1};
  const scale = camera.scale / flowOpeningCamera.scale;
  return {
    x: camera.x - flowOpeningCamera.x * scale,
    y: camera.y - flowOpeningCamera.y * scale,
    scale,
  };
};

export const projectScreenRect = (rect: {x: number; y: number; width: number; height: number}, transform: ScreenTransform) => ({
  x: transform.x + rect.x * transform.scale,
  y: transform.y + rect.y * transform.scale,
  width: rect.width * transform.scale,
  height: rect.height * transform.scale,
});

export const projectWorldPoint = (point: Point, camera: SharedCamera): Point => ({
  x: camera.x + point.x * camera.scale,
  y: camera.y + point.y * camera.scale,
});

/** Place source20's opening screen below the actual (possibly retimed) Flow
 * endpoint. Its 120px local lattice is the same canonical grid as Cost. */
export function issueSurfacePlacement(outgoing: SharedCamera): SharedCamera {
  return {
    x: Math.round(((640 - outgoing.x) / outgoing.scale - (640 + 19.5) * 5 / 6) / 100) * 100 + COST_NATIVE_TO_WORLD.x,
    y: Math.ceil(((720 - outgoing.y) / outgoing.scale) / 100) * 100 + 600 + COST_NATIVE_TO_WORLD.y,
    scale: COST_NATIVE_TO_WORLD.scale,
  };
}
export const issueOpeningCamera = (placement: SharedCamera): SharedCamera => ({
  x: -placement.x / placement.scale, y: -placement.y / placement.scale, scale: 1 / placement.scale,
});
export const flowIssuesCamera = (outgoing: SharedCamera, progress: number): SharedCamera =>
  interpolateCamera(outgoing, issueOpeningCamera(issueSurfacePlacement(outgoing)), progress);
