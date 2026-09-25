import {computeClipState} from 'dialkit/timeline';
import {BASH, BUDGET_TRACE_Y, THINKING_PEEK, THINKING_WARNINGS, clamp, lerp, markerCenter, smoothstep} from './geometry';
import {DEFAULTS, MICRO_16_TIMELINE, normalizeControls, normalizeTiming, resolveMicro16Clips, type ClipKey, type ClipTiming, type Controls, type Timing} from './timeline';

export const safeTime = (time: number) => Number.isFinite(time) ? Math.max(0, time) : 0;
const phase = (time: number, clip: ClipTiming) => clip.duration === 0 ? Number(time >= clip.at) : clamp((time - clip.at) / clip.duration);
const envelope = (time: number, timing: Timing) => smoothstep(phase(time, timing.budgetRun)) * (1 - smoothstep(phase(time, timing.budgetDepletion)));
// Gauss-Legendre integrates the product of two cubic envelopes exactly on each
// interval. Absolute-time integration avoids time*changingSpeed and rewind state.
const NODES = [-.8611363115940526, -.3399810435848563, .3399810435848563, .8611363115940526];
const WEIGHTS = [.3478548451374538, .6521451548625461, .6521451548625461, .3478548451374538];
export function integratedBudgetClock(time: number, timing: Timing) {
  const end = Math.min(safeTime(time), timing.budgetDepletion.at + timing.budgetDepletion.duration);
  const points = [...new Set([0, end, timing.budgetRun.at, timing.budgetRun.at + timing.budgetRun.duration,
    timing.budgetDepletion.at, timing.budgetDepletion.at + timing.budgetDepletion.duration].filter(t => t >= 0 && t <= end))].sort((a, b) => a - b);
  return points.slice(1).reduce((sum, right, i) => {
    const left = points[i]; const half = (right - left) / 2; const mid = (left + right) / 2;
    return sum + half * NODES.reduce((area, node, j) => area + WEIGHTS[j] * envelope(mid + node * half, timing), 0);
  }, 0);
}

// Integrate the union of movement windows, so overlapping entry/stop tracks
// don't double the spinner speed. Holds contribute no time; seeks are pure.
const movingSeconds = (time: number, windows: {at: number; duration: number}[]) => {
  let coveredUntil = 0;
  return [...windows].sort((a, b) => a.at - b.at).reduce((elapsed, window) => {
    const end = Math.min(time, window.at + window.duration);
    const duration = Math.max(0, end - Math.max(coveredUntil, window.at));
    coveredUntil = Math.max(coveredUntil, end);
    return elapsed + duration;
  }, 0);
};

export function sampleMicro16(timeInput: number, input: Partial<Controls> = DEFAULTS, timingInput: Partial<Timing> = MICRO_16_TIMELINE) {
  const time = safeTime(timeInput); const controls = normalizeControls(input); const timing = normalizeTiming(timingInput);
  const clips = resolveMicro16Clips(timing);
  // DialKit clamps visual durations to .05s; preserve authored instantaneous steps.
  const p = Object.fromEntries(clips.map(clip => [clip.key, timing[clip.key as ClipKey].duration === 0
    ? Number(time >= timing[clip.key as ClipKey].at)
    : clamp((computeClipState(clip, time, time) as {current: {progress: number}}).current.progress)])) as Record<keyof Timing, number>;
  // Separate row occupants: each begins/ends fully outside the frame. No
  // vertical connector or in-frame teleport, even when passes are retimed.
  const cheapAgents = (['cheapLegOneRight', 'cheapLegTwoLeft', 'cheapLegThreeRight'] as const).map((key, row) => ({
    x: lerp(row === 1 ? 1360 : -80, row === 1 ? -80 : 1360, p[key]),
    y: 121 + row * 240,
    angle: Math.max(0, Math.min(time - timing[key].at, timing[key].duration)) * controls.cheapSpinnerSpeed * 360,
  }));
  const thinkingPeek = {
    drop: THINKING_PEEK.drop * p.thinkingDrop,
    warnings: THINKING_WARNINGS.map(warning => ({...warning,
      y: lerp(THINKING_PEEK.y + THINKING_PEEK.height / 2, warning.y, p.thinkingDrop),
      angle: THINKING_PEEK.angle * p.thinkingDrop,
    })),
  };
  const descent = BASH.descent * p.bashDescent;
  const bashMotionClock = movingSeconds(time, clips
    .filter(clip => ['purpleBashEntry', 'purpleBashStop', 'bashDescent'].includes(clip.key))
    .map(clip => ({at: clip.at, duration: timing[clip.key as ClipKey].duration === 0 ? 0 : clip.duration})));
  const bashAgent = {x: -80 + 360 * p.purpleBashEntry + 60 * p.purpleBashStop, y: BASH.y + 60 + descent,
    angle: bashMotionClock * controls.purpleSpinnerSpeed * 360};
  const budgetPower = envelope(time, timing);
  const clock = integratedBudgetClock(time, timing);
  const budgetAgent = {x: lerp(-80, 640, p.purpleBudgetEntry) + controls.travelSpeed * clock, y: BUDGET_TRACE_Y + 60,
    angle: (Math.min(Math.max(0, time - timing.purpleBudgetEntry.at), timing.purpleBudgetEntry.duration) + clock) * controls.purpleSpinnerSpeed * 360};
  const camera = {
    x: controls.travelSpeed * clock,
    // Additive, same-plane translations: no shot swaps, fades, scaling or resets.
    y: 960 * p.cameraDownToBash + descent + 1200 * p.cameraDownToBudget,
  };
  const budgetRemaining = 1 - smoothstep(phase(time, timing.budgetDepletion));
  // Fade and shrink are independent authored tracks, not aliases for speed.
  // The floor is relative to Smoke Size; entry/birth may still grow from zero.
  const smokeBodyScale = lerp(1, controls.smokeMinimumScale, p.smokeShrink);
  const smokeScale = smokeBodyScale * p.smokeEnter * controls.smokeSize;
  const smokeOpacity = (1 - p.smokeFade) * p.smokeEnter;
  const screenAgent = {x: budgetAgent.x - camera.x, y: budgetAgent.y - camera.y};
  const squash = Math.cos(clock * Math.PI * 2 / .7);
  const cloudWidth = 263 * smokeScale * (1 - .12 * squash);
  const cloudHeight = 263 * smokeScale * (1 + .05 * squash);
  const smokeBounds = {x: screenAgent.x + 61 - cloudWidth, y: screenAgent.y - 25 - cloudHeight, width: cloudWidth, height: cloudHeight};
  const latest = Math.floor((clock - .35) / .7);
  const puffs = Array.from({length: 5}, (_, i) => latest - i).flatMap(index => {
    if (index < 0) return [];
    const age = clock - (index * .7 + .35); const life = age / 2.4;
    if (life < 0 || life >= 1) return [];
    const scale = Math.max(controls.smokeMinimumScale, smokeBodyScale * (1 - .82 * life));
    const size = 156 * scale * p.smokeEnter * controls.smokeSize * smoothstep(age / .2);
    return [{bounds: {x: screenAgent.x - 82 - 600 * life - size, y: screenAgent.y - 288 - 24 * life, width: size, height: size},
      opacity: .64 * (1 - smoothstep((life - .45) / .55)) * smokeOpacity}];
  });
  return {time, controls, timing, progress: p, cheapAgents, thinkingPeek, bashAgent, budgetAgent, camera,
    cloud: {progress: p.cloudSweep, yOffset: 37, translateY: 900 * p.cloudSweep},
    paperHeight: BASH.paperHeight * p.bashExpand, descent,
    warning: {x: bashAgent.x - 111, y: bashAgent.y - 96, scale: p.bashWarning},
    budgetRemaining, budgetPower, budgetSpeed: controls.travelSpeed * budgetPower,
    budgetClock: clock, budgetMarker: markerCenter(budgetRemaining),
    smokeScale, smokeOpacity, smokeBounds, puffs};
}
export type Micro16State = ReturnType<typeof sampleMicro16>;
export const sampleMicro16Frame = (frame: number, controls?: Partial<Controls>, timing?: Partial<Timing>) => sampleMicro16(frame / 30, controls, timing);
