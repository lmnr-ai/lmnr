import {getDispersionHistory} from './dispersion';
import {warningAppearanceTiming} from './appearance';
import {CELL_COUNT, CLUSTERS, TOKEN_BY_ID, cellCenter, type Token} from './geometry';
import {MICRO_14_FPS, MICRO_14_TIMING, clipProgress, normalizeControls, normalizeTiming, type Micro14Controls, type Micro14Timing} from './timeline';

export type TokenPose = Readonly<{token: Token; x: number; y: number}>;
export type ClusterMerge = Readonly<{
  readyAt: number;
  smallWarningScale: number;
  clusterBackgroundOpacity: number;
  largeWarningScale: number;
}>;
export type Micro14Sample = Readonly<{
  authoredFrame: number;
  phase: 'dispersed-hold' | 'gathering' | 'intermediate-hold' | 'merge' | 'end-hold';
  tokens: readonly TokenPose[];
  warningAppearance: Readonly<Record<string, number>>;
  clusters: Readonly<Record<string, ClusterMerge>>;
}>;
const smooth = (x: number) => x * x * (3 - 2 * x);
const positionsForState = (state: readonly string[]) => new Map(state.map((id, index) => [id, index]));

// Each equal-sized slot contains movement first, then a stationary gap.
// Never generate a fresh walk during playback: interpolate only S[k] -> S[k-1].
export const inverseStepProgress = (progress: number, frames: number, gap: number) => {
  const rawSteps = Math.max(0, Math.min(frames, progress * frames));
  const nearest = Math.round(rawSteps);
  const steps = Math.abs(rawSteps - nearest) < 1e-9 ? nearest : rawSteps;
  const step = Math.floor(steps);
  return {step, fraction: Math.min(1, (steps - step) / (1 - gap))};
};

export function sampleMicro14(time: number, rawControls: Micro14Controls, rawTiming: Micro14Timing = MICRO_14_TIMING): Micro14Sample {
  const controls = normalizeControls(rawControls);
  const timing = normalizeTiming(rawTiming);
  const seconds = Number.isFinite(time) ? Math.max(0, time) : 0;
  const history = getDispersionHistory(controls.seed, controls.dispersionFrames, controls.swapProbability, controls.smallClusterDelay);
  const swapping = clipProgress(seconds, timing.swapping);
  const {step, fraction} = inverseStepProgress(swapping, history.frames, controls.swapGap);
  const stateA = history.states[history.frames - step];
  const stateB = history.states[Math.max(0, history.frames - step - 1)];
  const positionsA = positionsForState(stateA);
  const positionsB = stateA === stateB ? positionsA : positionsForState(stateB);
  const tokens = Object.freeze(Array.from({length: CELL_COUNT}, (_, tokenIndex) => {
    const token = TOKEN_BY_ID.get(`cell-${tokenIndex}`)!;
    const a = cellCenter(positionsA.get(token.id)!);
    const b = cellCenter(positionsB.get(token.id)!);
    return Object.freeze({token, x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction});
  }));
  const initialPositions = positionsForState(history.states[history.frames]);
  const appearanceEnds: Record<string, number> = {};
  const warningAppearance = Object.freeze(Object.fromEntries(tokens.filter(({token}) => token.kind === 'warning').map(({token}) => {
    const clip = warningAppearanceTiming(controls.seed, initialPositions.get(token.id)!, timing.appearance, controls.warningAppearanceDuration);
    if (token.clusterId) appearanceEnds[token.clusterId] = Math.max(appearanceEnds[token.clusterId] ?? 0, clip.at + clip.duration);
    return [token.id, smooth(clipProgress(seconds, clip))];
  })));
  const clusters = Object.freeze(Object.fromEntries(CLUSTERS.map(cluster => {
    const readyStep = history.clusterReadySteps[cluster.id];
    // The last arriving swap finishes BEFORE its slot's trailing gap.
    // A group that never moved is already ready when the scene starts.
    const settledAt = readyStep === 0 ? 0 : timing.swapping.at
      + (readyStep - controls.swapGap) * timing.swapping.duration / history.frames;
    // Already-complete groups still need their dots to become warnings first.
    const readyAt = Math.max(settledAt, appearanceEnds[cluster.id] ?? 0);
    const progress = smooth(clipProgress(seconds, {at: readyAt, duration: controls.warningCoverDuration}));
    return [cluster.id, Object.freeze({readyAt, smallWarningScale: 1 - progress,
      clusterBackgroundOpacity: progress, largeWarningScale: progress})];
  })));
  const merges = Object.values(clusters);
  const done = merges.every(cluster => cluster.smallWarningScale === 0 && cluster.clusterBackgroundOpacity === 1 && cluster.largeWarningScale === 1);
  const merging = merges.some(cluster => cluster.smallWarningScale < 1 || cluster.clusterBackgroundOpacity > 0 || cluster.largeWarningScale > 0);
  const phase = done && swapping === 1 ? 'end-hold' : seconds < timing.swapping.at ? 'dispersed-hold'
    : swapping < 1 ? 'gathering' : merging ? 'merge' : 'intermediate-hold';
  return Object.freeze({authoredFrame: seconds * MICRO_14_FPS, phase, tokens, warningAppearance, clusters});
}

export const sampleMicro14Frame = (frame: number, controls: Micro14Controls, timing: Micro14Timing = MICRO_14_TIMING) =>
  sampleMicro14(frame / MICRO_14_FPS, controls, timing);
