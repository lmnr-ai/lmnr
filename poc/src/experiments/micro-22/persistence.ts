import {MICRO_22_TIMELINE_ID, MICRO_22_TIMING, type Micro22Timing} from './timeline';

const oldEase = [.45, 0, .55, 1];
const isOriginalShallowDescent = (clip: any) => clip?.at === 1.6 && clip.duration === 1.3
  && clip.from?.progress === 0 && clip.to?.progress === 343 / 2040
  && clip.transition?.type === 'easing' && clip.transition.duration === 1.3
  && JSON.stringify(clip.transition.ease) === JSON.stringify(oldEase);

/** Load only: upgrade the exact generated shallow default, never tuned/imported bars.
 * New motion tracks mark already-upgraded/explicitly normalized records. */
export function upgradeStoredMicro22Timing(timing?: Partial<Micro22Timing>): Partial<Micro22Timing> | undefined {
  if (!timing || timing.warningExit !== undefined || !isOriginalShallowDescent(timing.bashDescent)) return timing;
  return {...timing, bashDescent: structuredClone(MICRO_22_TIMING.bashDescent)};
}

/** Run before standalone DialKit registration; retain all preset/custom values.
 * Keep an original backup and mark even fresh storage so later imports stay literal. */
export function migrateMicro22DepthStorage(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  const marker = 'micro22:deep-report-motion-v1', key = `dialkit:${MICRO_22_TIMELINE_ID}`;
  try {
    if (storage.getItem(marker)) return;
    const original = storage.getItem(key), saved = original ? JSON.parse(original) : null;
    if (saved?.version === 1 && saved.values && typeof saved.values === 'object') {
      const migrate = (values: Record<string, unknown>) => {
        if (!values || values['warningExit.at'] !== undefined || !isOriginalShallowDescent({
          at: values['bashDescent.at'], duration: values['bashDescent.duration'],
          from: {progress: values['bashDescent.from.progress']}, to: {progress: values['bashDescent.to.progress']},
          transition: values['bashDescent.transition'],
        })) return values;
        return {...values, 'bashDescent.duration': 1.69, 'bashDescent.to.progress': 1,
          'bashDescent.transition': {...MICRO_22_TIMING.bashDescent.transition}};
      };
      const next = {...saved, values: migrate(saved.values),
        ...(saved.baseValues ? {baseValues: migrate(saved.baseValues)} : {}),
        ...(Array.isArray(saved.presets) ? {presets: saved.presets.map((p: any) => ({...p, values: migrate(p.values)}))} : {})};
      if (JSON.stringify(next) !== original) {
        const backup = `${marker}:original`;
        if (!storage.getItem(backup)) storage.setItem(backup, original!);
        storage.setItem(key, JSON.stringify(next));
      }
    }
    storage.setItem(marker, '1');
  } catch { /* Unavailable/malformed storage must not prevent preview or erase data. */ }
}

const oldCaptionDefaults = {subtitleFlow: [0, 3.8], subtitleDetection: [3.8, 1.7], subtitleLabels: [5.5, 2], subtitleStructure: [7.5, 3.8]} as const;
/** A normalized import includes subtitleReporting and is always literal. */
export function upgradeStoredMicro22Captions(timing?: Partial<Micro22Timing>): Partial<Micro22Timing> | undefined {
  if (!timing || timing.subtitleReporting !== undefined) return timing;
  const next = {...timing};
  for (const key of Object.keys(oldCaptionDefaults) as (keyof typeof oldCaptionDefaults)[]) {
    const [at, duration] = oldCaptionDefaults[key], c = timing[key];
    if (c?.at === at && c.duration === duration && c.from?.progress === 0 && c.to?.progress === 1
      && c.transition?.type === 'easing' && c.transition.duration === duration
      && JSON.stringify(c.transition.ease) === JSON.stringify(oldEase)) next[key] = structuredClone(MICRO_22_TIMING[key]);
  }
  return next;
}
export function migrateMicro22CaptionStorage(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  const marker = 'micro22:action-captions-v1', key = `dialkit:${MICRO_22_TIMELINE_ID}`;
  try {
    if (storage.getItem(marker)) return;
    const original = storage.getItem(key), saved = original ? JSON.parse(original) : null;
    if (saved?.version === 1 && saved.values) {
      const migrate = (values: Record<string, unknown>) => {
        if (!values || values['subtitleReporting.at'] !== undefined) return values;
        const timing = Object.fromEntries(Object.keys(oldCaptionDefaults).map(key => [key, {
          at: values[`${key}.at`], duration: values[`${key}.duration`], from: {progress: values[`${key}.from.progress`]},
          to: {progress: values[`${key}.to.progress`]}, transition: values[`${key}.transition`],
        }]));
        const next = upgradeStoredMicro22Captions(timing)!;
        return {...values, ...Object.fromEntries(Object.keys(oldCaptionDefaults).flatMap(key => {
          const c = next[key as keyof typeof oldCaptionDefaults]!;
          return c === timing[key] ? [] : [[`${key}.at`, c.at], [`${key}.duration`, c.duration], [`${key}.transition`, c.transition]];
        }))};
      };
      const next = {...saved, values: migrate(saved.values), ...(saved.baseValues ? {baseValues: migrate(saved.baseValues)} : {}),
        ...(Array.isArray(saved.presets) ? {presets: saved.presets.map((p: any) => ({...p, values: migrate(p.values)}))} : {})};
      if (JSON.stringify(next) !== original) {
        if (!storage.getItem(`${marker}:original`)) storage.setItem(`${marker}:original`, original!);
        storage.setItem(key, JSON.stringify(next));
      }
    }
    storage.setItem(marker, '1');
  } catch { /* Preserve unavailable or malformed storage. */ }
}
