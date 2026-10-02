import {ISSUE_KEYS} from '../micro-20/timeline';
import {micro22PreludeEnd, normalizeMicro22IssueTiming} from './timeline';
import {DialStore} from 'dialkit';
import {installMicro20AuthoringCompatibility} from '../micro-20/authoring';
import {MICRO_22_KEYS, MICRO_22_TIMELINE_ID, normalizeMicro22Timing, type Micro22Timing} from './timeline';
import type {Micro22Progress} from './sample';
export function installMicro22AuthoringCompatibility(id = MICRO_22_TIMELINE_ID, prefix = '') {
  installMicro20AuthoringCompatibility(DialStore, undefined, true, id, [...(prefix ? ['leadIn.transition'] : []), ...MICRO_22_KEYS.map(key => `${prefix}${key}.transition`), ...ISSUE_KEYS.map(key => `postlude_${key}.transition`)]);
}
/** Physics springs resolve to a settling duration; persist the raw authored duration instead. */
export function micro22AuthoredClip(clip: Record<string, any>, key: string, flat: Record<string, unknown>) {
  const duration = flat[`${key}.duration`];
  return {...clip, duration: typeof duration === 'number' && Number.isFinite(duration) ? duration : clip.duration,
    transition: flat[`${key}.transition`] ?? clip.transition};
}
export function micro22TimelineState(timeline: Record<string, any>, offset = 0, prefix = '', flat: Record<string, unknown> = {}) {
  return {
    timing: normalizeMicro22Timing(Object.fromEntries(MICRO_22_KEYS.map(key => {const c = timeline[`${prefix}${key}`]; return [key, c ? {...micro22AuthoredClip(c, `${prefix}${key}`, flat), at: Math.max(0, c.at - offset)} : undefined];})) as Micro22Timing),
    progress: Object.fromEntries(MICRO_22_KEYS.map(key => [key, timeline[`${prefix}${key}`]?.current?.progress])) as Micro22Progress,
  };
}

export function micro22PostludeState(timeline: Record<string, any>, offset: number, flat: Record<string, unknown> = {}) {
  return {
    issueTiming: normalizeMicro22IssueTiming(Object.fromEntries(ISSUE_KEYS.map(key => {
      const c = timeline[`postlude_${key}`];
      return [key, c ? {...micro22AuthoredClip(c, `postlude_${key}`, flat), at: Math.max(0, c.at - offset)} : undefined];
    }))),
    progress: Object.fromEntries(ISSUE_KEYS.map(key => [key, timeline[`postlude_${key}`]?.current?.progress])),
  };
}
export type PostludeAnchor = {start: number; starts: number[]; presetId: string | null};
/** Ripple a prelude-only edit, but treat a preset/batch supplying postlude starts
 * as a complete authored schedule rather than adding the prelude delta twice. */
export function micro22PostludeOffset(current: PostludeAnchor, previous: PostludeAnchor) {
  const suppliedPostlude = current.presetId !== previous.presetId
    || current.starts.some((at, index) => at !== previous.starts[index]);
  return suppliedPostlude ? current.start : previous.start;
}
export function micro22TimelineConfig(timing: Micro22Timing, issueTiming = normalizeMicro22IssueTiming()) {
  const start = micro22PreludeEnd(timing);
  return {...timing, ...Object.fromEntries(ISSUE_KEYS.map(key => [`postlude_${key}`, {...issueTiming[key], at: start + issueTiming[key].at}]))};
}
