import {introducingFlowState} from '../introducing-flow-1/geometry';
import {originalFlowPlayback, type Flow2Playback} from './sample';
import {GRAPH_MODELS} from './metrics';
import {beadProgress, DEFAULT_BEAD_STAGGER_SECONDS} from './beads';

/** Frames 4844:7684 / 4844:8056: all beads start on the x=280 grid-aligned string;
 * flow-1 ends at x=1150. Reference peer positions are illustrative;
 * Landing description F1 determines peer Y; flow-1 is art-directed to 4.5 grid cells.
 */
export const GRAPH = {
  f1Ceiling: 85, f1TickStep: 5, peersX: 280, ballStartX: 280, ballEndX: 1150,
  valueOriginX: 120, valueTickStep: 100, valueTickPixels: 136,
  pitch: 60, gridOriginX: 40, ballGridY: 4.5, stringExitDistance: 330,
};
export const GRAPH_WORLD_ORIGIN = {x: -220 / .6, y: 720 / .6};
const flow = GRAPH_MODELS.find(model => model.id === 'flow')!;
export const descF1Y = (descF1: number) => (GRAPH.f1Ceiling - descF1) / GRAPH.f1TickStep * GRAPH.pitch * 2;
export const valueX = (tracesPerDollar: number) => GRAPH.valueOriginX + tracesPerDollar / GRAPH.valueTickStep * GRAPH.valueTickPixels;
const mix = (a: number, b: number, progress: number) => a * (1 - progress) + b * progress;
const labels = {opus: 'opus-5', sonnet: 'sonnet-5', sol: 'gpt-6 sol', gemini: 'gemini-3.8 flash', luna: 'gpt-6 luna'} as const;
export const BEAD_START_Y = 800;

export const AXES = {yLeft: -36, yWidth: 136, yOffscreenX: -136, xLeft: 0, xTop: 600, xOffscreenY: 720};
const unit = (p: number) => Math.min(1, Math.max(0, p));
export const AXIS_TICK_STEP = GRAPH.pitch * 2;
export const AXIS_TICKS = {
  x: Array.from({length: 9}, (_, index) => {
    const value = index * GRAPH.valueTickStep;
    return {position: valueX(value), value, label: String(value)};
  }),
  y: Array.from({length: 5}, (_, index) => {
    const value = GRAPH.f1Ceiling - (index + 1) * GRAPH.f1TickStep;
    return {position: descF1Y(value), value, label: `${value}%`};
  }),
};

export function graphAxesState(playback: Flow2Playback) {
  const p = playback.progress;
  // Exit tracks normally finish before descent. This also prevents a retimed
  // axis track from leaking its opaque panel into the engine chapter.
  const beforeDescent = playback.time < playback.timing.cameraToEngine.at;
  return {
    y: {x: mix(AXES.yOffscreenX, AXES.yLeft, unit(p.xAxisEntry) * (1 - unit(p.yAxisExit))), visible: beforeDescent && p.xAxisEntry > 0 && p.yAxisExit < 1},
    x: {y: mix(AXES.xOffscreenY, AXES.xTop, unit(p.xAxisEntry) * (1 - unit(p.xAxisExit))), visible: beforeDescent && p.xAxisEntry > 0 && p.xAxisExit < 1},
  };
}

export function graphState(playback: Flow2Playback, beadStaggerSeconds = DEFAULT_BEAD_STAGGER_SECONDS, flowRevealAt?: number) {
  const p = playback.progress;
  const beads = beadProgress(playback, beadStaggerSeconds, flowRevealAt);
  const stringX = mix(-90, GRAPH.ballStartX, p.ballEntry);
  // Keep the art-directed flow-1 anchor fixed: the new exact X is 1148.16,
  // only 1.84px from the retained 1150px position (within the 15px allowance).
  const ballX = mix(stringX, GRAPH.ballEndX, p.graphSpread) + GRAPH.stringExitDistance * p.stringExit;
  const ballY = mix(BEAD_START_Y, GRAPH.ballGridY * GRAPH.pitch, beads.flow);
  return {
    string: {x: ballX, opacity: Math.min(1, Math.max(0, p.ballEntry)), crossbar: Math.min(1, Math.max(0, p.graphSpread))},
    ball: {x: ballX, y: ballY, opacity: beads.flow > 0 ? 1 : 0, size: mix(20, 60, unit(p.graphSpread)), score: flow.descF1.toFixed(1)},
    scoresOpacity: 1 - unit(p.graphSpread),
    flowLabel: {x: mix(ballX + 30, ballX - 131, p.flowLabel), y: mix(ballY - 16, ballY + 26, p.flowLabel)},
    points: GRAPH_MODELS.filter(model => model.id !== 'flow').map(model => ({...model,
      label: labels[model.id],
      x: mix(stringX, valueX(model.tracesPerDollar), p.graphSpread),
      y: mix(BEAD_START_Y, descF1Y(model.descF1), beads[model.id]),
      opacity: beads[model.id] > 0 ? p.modelPoints : 0,
      labelFlip: model.id === 'luna' ? Math.min(1, Math.max(0, p.graphSpread)) : 0,
    })),
  };
}

export function flow2WorldState(playback: Flow2Playback) {
  const state = introducingFlowState(originalFlowPlayback(playback));
  // No analysis camera pan: add its former 240px to the later engine descent.
  // Title and final engine landmarks remain identical to Animation 13.
  return {...state, camera: {...state.camera, y: state.camera.y - 240 * playback.progress.cameraToEngine}};
}
