import {warningAppearanceTiming} from '../micro-14/appearance';
import {CELL_COUNT, CLUSTERS, TOKENS, cellCenter} from '../micro-14/geometry';
import type {GroundDot} from '../micro-14/Scene';
import type {Micro14Sample} from '../micro-14/sample';
import {clipProgress, type ClipTiming} from '../micro-14/timeline';
import {APPEARANCE_SEED, START_CELLS} from './starting-positions';
import {travelTimingForCell} from './travel';
import {sampleAgentWindow, type AgentWindowSample} from './agent-window';
import {MICRO_15_SUBTITLE_KEYS, MICRO_15_TIMING, normalizeMicro15Controls, normalizeMicro15Timing, type Micro15Controls, type Micro15SubtitleKey, type Micro15Timing} from './timeline';

export type Micro15SubtitleProgress = Readonly<Record<Micro15SubtitleKey, number>>;
export type Micro15Sample = Micro14Sample & Readonly<{groundDots: readonly GroundDot[]; agent: AgentWindowSample; subtitles: Micro15SubtitleProgress}>;
const smooth = (value: number) => value * value * (3 - 2 * value);
const warningAtStart = new Map(Object.entries(START_CELLS).map(([id, cell]) => [cell, id]));

export function sampleMicro15(time: number, rawControls: Micro15Controls, rawTiming: Micro15Timing = MICRO_15_TIMING): Micro15Sample {
  const controls = normalizeMicro15Controls(rawControls);
  const timing = normalizeMicro15Timing(rawTiming);
  const seconds = Number.isFinite(time) ? Math.max(0, time) : 0;
  const warningAppearance: Record<string, number> = {};
  const readyAt: Record<string, number> = {};
  let lastArrival = 0;
  const tokens = Object.freeze(TOKENS.map((token, homeCell) => {
    const target = cellCenter(homeCell);
    if (token.kind === 'dot') return Object.freeze({token, ...target});
    const start = cellCenter(START_CELLS[token.id]);
    const appearance = warningAppearanceTiming(APPEARANCE_SEED, START_CELLS[token.id], timing.appearance, controls.warningAppearanceDuration);
    warningAppearance[token.id] = smooth(clipProgress(seconds, appearance));
    const travel = travelTimingForCell(START_CELLS[token.id], timing.travelStart, controls.travelDuration);
    const progress = smooth(clipProgress(seconds, travel));
    const arrival = start.x === target.x && start.y === target.y ? 0 : travel.at + travel.duration;
    lastArrival = Math.max(lastArrival, arrival, appearance.at + appearance.duration);
    if (token.clusterId) {
      readyAt[token.clusterId] = Math.max(readyAt[token.clusterId] ?? 0, arrival, appearance.at + appearance.duration);
    }
    return Object.freeze({token, x: start.x + (target.x - start.x) * progress, y: start.y + (target.y - start.y) * progress});
  }));
  const clusters = Object.freeze(Object.fromEntries(CLUSTERS.map(cluster => {
    // Each authored track sets an earliest start; never cover an unfinished
    // square. Duration and later starts are independently controlled per track.
    const progress = (clip: ClipTiming) => smooth(clipProgress(seconds, {...clip, at: Math.max(readyAt[cluster.id], clip.at)}));
    return [cluster.id, Object.freeze({readyAt: readyAt[cluster.id],
      smallWarningScale: 1 - progress(timing.triangleScaleOut),
      clusterBackgroundOpacity: progress(timing.coverAppearance),
      largeWarningScale: progress(timing.triangleScaleIn)})];
  })));
  // During the intro, a standing triangle replaces its initial dot. As travel
  // starts, the entire fixed dot layer is revealed UNDER the moving triangles.
  // Dots never follow, swap with, or react to a triangle crossing their cell.
  const groundDots = Object.freeze(Array.from({length: CELL_COUNT}, (_, cell) => {
    const warning = warningAtStart.get(cell);
    const scale = seconds >= timing.travelStart.at || !warning ? 1 : 1 - warningAppearance[warning];
    return Object.freeze({cell, ...cellCenter(cell), scale});
  }));
  const traveled = seconds >= lastArrival;
  const covered = Object.values(clusters).every(cluster => cluster.largeWarningScale === 1
    && cluster.smallWarningScale === 0 && cluster.clusterBackgroundOpacity === 1);
  const phase = traveled && covered ? 'end-hold' : seconds < timing.travelStart.at ? 'dispersed-hold' : !traveled ? 'gathering' : 'merge';
  const subtitles = Object.freeze(Object.fromEntries(MICRO_15_SUBTITLE_KEYS.map(key => [key, clipProgress(seconds, timing[key])]))) as Micro15SubtitleProgress;
  return Object.freeze({authoredFrame: seconds * 30, phase, tokens, warningAppearance: Object.freeze(warningAppearance), clusters, groundDots, agent: sampleAgentWindow(seconds, timing), subtitles});
}

/** DialKit's live clip values keep paused drag edits visible; exports use the pure sampler above. */
export function sampleMicro15Live(time: number, controls: Micro15Controls, rawTiming: Micro15Timing, timeline: any): Micro15Sample {
  const sample = sampleMicro15(time, controls, rawTiming);
  const timing = normalizeMicro15Timing(rawTiming);
  const subtitles = Object.freeze(Object.fromEntries(MICRO_15_SUBTITLE_KEYS.map(key => [key,
    timing[key].duration === 0
      ? Number(time >= timing[key].at)
      : timeline[key]?.current?.progress ?? sample.subtitles[key],
  ]))) as Micro15SubtitleProgress;
  return Object.freeze({...sample, subtitles});
}

export const sampleMicro15Frame = (frame: number, controls: Micro15Controls, timing: Micro15Timing = MICRO_15_TIMING) =>
  sampleMicro15(frame / 30, controls, timing);
