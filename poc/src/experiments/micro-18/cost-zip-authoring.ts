import {chapterSchedule} from './sample';
import {normalizeSettings, type Ultimate3Settings} from './settings';

export const COST_ZIP_KEY = 'yellowAgentZip';
export const COST_ZIP_LEGS = ['cheapLegOneRight', 'cheapLegTwoLeft', 'cheapLegThreeRight'] as const;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-8;

/** A native range handle over the three existing clips, not a second motion clock.
 * Main is global; the individual Cost bars remain chapter-local and authoritative. */
export function costZipTimelineConfig(settings: Ultimate3Settings) {
  const legs = COST_ZIP_LEGS.map(key => settings.cost.timing[key]);
  const at = Math.min(...legs.map(clip => clip.at));
  const duration = Math.max(.05, Math.max(...legs.map(clip => clip.at + clip.duration)) - at);
  return {[COST_ZIP_KEY]: {at: chapterSchedule(settings)[1].start + at, duration,
    from: {progress: 0}, to: {progress: 1},
    transition: {type: 'easing' as const, duration, ease: [0, 0, 1, 1] as [number, number, number, number]}}};
}
export function costZipTimelineValues(settings: Ultimate3Settings): Record<string, unknown> {
  const clip = costZipTimelineConfig(settings)[COST_ZIP_KEY];
  return {[`${COST_ZIP_KEY}.at`]: clip.at, [`${COST_ZIP_KEY}.duration`]: clip.duration,
    [`${COST_ZIP_KEY}.from.progress`]: 0, [`${COST_ZIP_KEY}.to.progress`]: 1,
    [`${COST_ZIP_KEY}.transition`]: clip.transition};
}

/** Moving shifts every leg equally; resizing scales their durations and gaps.
 * Curves belong to the individual clips, so this aggregate handle stays linear. */
export function settingsFromCostZipTimeline(timeline: Record<string, {at: number; duration: number}>, settings: Ultimate3Settings, flat: Record<string, unknown> = {}) {
  const source = costZipTimelineConfig(settings)[COST_ZIP_KEY];
  const request = timeline[COST_ZIP_KEY];
  const rawDuration = flat[`${COST_ZIP_KEY}.duration`] ?? request.duration;
  const chapterStart = chapterSchedule(settings)[1].start;
  const at = Math.max(chapterStart, Number.isFinite(request.at) ? request.at : source.at);
  const positive = COST_ZIP_LEGS.map(key => settings.cost.timing[key].duration).filter(duration => duration > 0);
  const minimum = positive.length ? Math.max(.05, source.duration * .05 / Math.min(...positive)) : .05;
  const duration = Math.max(minimum, typeof rawDuration === 'number' && Number.isFinite(rawDuration) ? rawDuration : source.duration);
  if (near(at, source.at) && near(duration, source.duration)) return settings;
  const ratio = duration / source.duration;
  const oldLocalStart = source.at - chapterStart;
  const timing = {...settings.cost.timing};
  for (const key of COST_ZIP_LEGS) {
    const clip = timing[key];
    const transition = clip.transition && 'duration' in clip.transition && typeof clip.transition.duration === 'number'
      ? {...clip.transition, duration: clip.transition.duration * ratio} : clip.transition;
    timing[key] = {...clip, at: at - chapterStart + (clip.at - oldLocalStart) * ratio,
      duration: clip.duration * ratio, transition};
  }
  return normalizeSettings({...settings, cost: {...settings.cost, timing}});
}
