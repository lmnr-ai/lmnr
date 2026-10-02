import {introducingFlowState} from '../introducing-flow-1/geometry';
import {originalFlowPlayback, type Flow3Playback} from './sample';
import {GRAPH_MODELS} from './metrics';
import {beadProgress, DEFAULT_BEAD_STAGGER_SECONDS} from './beads';

/** Retained intelligence pose: peers share the x=280 string; description F1
 * determines peer Y and flow-1 is art-directed to 4.5 grid cells. */
export const GRAPH = {
  f1Ceiling: 85, f1TickStep: 5, ballStartX: 280, pitch: 60, ballGridY: 4.5,
};
export const GRAPH_WORLD_ORIGIN = {x: -220 / .6, y: 720 / .6};
const flow = GRAPH_MODELS.find(model => model.id === 'flow')!;
export const descF1Y = (descF1: number) => (GRAPH.f1Ceiling - descF1) / GRAPH.f1TickStep * GRAPH.pitch * 2;
const mix = (a: number, b: number, progress: number) => a * (1 - progress) + b * progress;
const labels = {opus: 'opus-5', sonnet: 'sonnet-5', sol: 'gpt-6 sol', gemini: 'gemini-3.8 flash', luna: 'gpt-6 luna'} as const;
export const BEAD_START_Y = 800;

export function graphState(playback: Flow3Playback, beadStaggerSeconds = DEFAULT_BEAD_STAGGER_SECONDS, flowRevealAt?: number) {
  const p = playback.progress;
  const beads = beadProgress(playback, beadStaggerSeconds, flowRevealAt);
  const stringX = mix(-90, GRAPH.ballStartX, p.ballEntry);
  const ballX = stringX; // The scene moves all beads, labels and string left as one group.
  const ballY = mix(BEAD_START_Y, GRAPH.ballGridY * GRAPH.pitch, beads.flow);
  return {
    string: {x: ballX, opacity: Math.min(1, Math.max(0, p.ballEntry)), crossbar: 0},
    ball: {x: ballX, y: ballY, opacity: beads.flow > 0 ? 1 : 0, size: 20, score: flow.descF1.toFixed(1)},
    scoresOpacity: 1,
    flowLabel: {x: ballX + 30, y: ballY - 16},
    points: GRAPH_MODELS.filter(model => model.id !== 'flow').map(model => ({...model,
      label: labels[model.id],
      x: stringX,
      y: mix(BEAD_START_Y, descF1Y(model.descF1), beads[model.id]),
      opacity: beads[model.id] > 0 ? p.modelPoints : 0,
      labelFlip: 0,
    })),
  };
}

export function flow3WorldState(playback: Flow3Playback) {
  const state = introducingFlowState(originalFlowPlayback(playback));
  // No analysis camera pan: add its former 240px to the later engine descent.
  // Title and final engine landmarks remain identical to Animation 13.
  return {...state, camera: {...state.camera, y: state.camera.y - 240 * playback.progress.cameraToEngine}};
}
