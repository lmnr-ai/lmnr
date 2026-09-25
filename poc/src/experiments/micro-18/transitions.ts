import {introducingFlowState, type IntroducingFlowState} from '../introducing-flow-1/geometry';
import type {FlowPlayback} from '../introducing-flow-1/sample';

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

// Cost's trimmed endpoint sees through world y≈4050. Flow starts 7.5 cells
// below that viewport and 12 cells right, aligning both chapter cameras so
// the bridge travels vertically while preserving the canonical lattice.
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

/** Compose Animation13's native camera with Flow's fixed world placement. */
export const flowCameraInSharedWorld = (camera: IntroducingFlowState['camera']): SharedCamera => ({
  x: camera.x - FLOW_PLACEMENT.x * camera.scale,
  y: camera.y - FLOW_PLACEMENT.y * camera.scale,
  scale: camera.scale,
});

const lerp = (a: number, b: number, progress: number) => a + (b - a) * progress;
export const interpolateCamera = (from: SharedCamera, to: SharedCamera, progress: number): SharedCamera => {
  const p = Math.max(0, Math.min(1, progress));
  return {x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p), scale: lerp(from.scale, to.scale, p)};
};

/** One camera only: frozen Cost endpoint → Flow opening, then native Flow camera. */
export const sharedWorldCamera = ({entryProgress, outgoingCostCamera, flowPlayback}: {
  entryProgress: number;
  outgoingCostCamera: Point;
  flowPlayback: FlowPlayback;
}): SharedCamera => {
  const flow = flowCameraInSharedWorld(introducingFlowState(flowPlayback).camera);
  if (entryProgress >= 1) return flow;
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
