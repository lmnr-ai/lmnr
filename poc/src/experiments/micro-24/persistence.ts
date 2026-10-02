import {INTRODUCING_FLOW_1_TIMELINE as original} from '../introducing-flow-1/timeline';
import {FLOW_3_TIMELINE, FLOW_3_TIMELINE_ID, MICRO23_TRACKS} from './timeline';

type Values = Record<string, unknown>;
type Panel = {version: number; values?: Values; baseValues?: Values; activePresetId?: string | null; presets?: Array<{id: string; name: string; values: Values}>};
const storageKey = (version: number) => `dialkit:micro-animation-24-timeline-v${version}`;
const flat = (config: Record<string, unknown>): Values => Object.fromEntries(Object.entries(config).flatMap(([key, raw]) => {
  if (typeof raw !== 'object' || !raw) return [[key, raw]];
  const clip = raw as {at: number; duration: number; from: {progress: number}; to: {progress: number}; transition: unknown};
  return [[`${key}.at`, clip.at], [`${key}.duration`, clip.duration], [`${key}.from.progress`, clip.from.progress], [`${key}.to.progress`, clip.to.progress], [`${key}.transition`, clip.transition]];
}));
const defaults = flat(FLOW_3_TIMELINE);
function previousDefaults(version: number): Values {
  const old = {...defaults};
  if (version === 1) {
    Object.assign(old, flat(original));
    old['stringExit.at'] = original.cameraToEngine.at;
    old['stringExit.duration'] = original.cameraToEngine.duration;
    old['stringExit.transition'] = original.cameraToEngine.transition;
  } else {
    for (const key of Object.values(MICRO23_TRACKS)) old[`${key}.at`] = Number(((defaults[`${key}.at`] as number) - .2).toFixed(2));
    old['subtitleIntelligence.duration'] = original.subtitleIntelligence.duration;
    old['subtitleIntelligence.transition'] = original.subtitleIntelligence.transition;
    old['subtitleCost.at'] = 5.57;
    old['subtitleCost.duration'] = 3.89;
    old['subtitleCost.transition'] = {...FLOW_3_TIMELINE.subtitleCost.transition, duration: 3.89};
  }
  return old;
}
function migrateValues(values: Values = {}, version: number, seed: Values = defaults): Values {
  const result = {...seed}, old = previousDefaults(version);
  for (const [path, value] of Object.entries(values)) {
    const key = path.split('.')[0];
    if (!(key in FLOW_3_TIMELINE)) continue; // Removed graph controls cannot drive the insert.
    if (JSON.stringify(value) === JSON.stringify(old[path])) continue;
    result[path] = path.endsWith('.at') && typeof value === 'number' && typeof old[path] === 'number' && typeof defaults[path] === 'number'
      ? value + ((defaults[path] as number) - (old[path] as number)) : value;
  }
  return result;
}

/** Load-only upgrade; preserve source records byte-for-byte and never replace v3 edits. */
export function migrateFlow3Timeline(storage: Pick<Storage, 'getItem' | 'setItem'>): void {
  try {
    const target = `dialkit:${FLOW_3_TIMELINE_ID}`;
    if (storage.getItem(target)) return;
    let values = {...defaults}, baseValues = {...defaults}, activePresetId: string | null = null;
    const presets = new Map<string, NonNullable<Panel['presets']>[number]>();
    let found = false;
    for (const version of [1, 2]) {
      const raw = storage.getItem(storageKey(version));
      if (!raw) continue;
      let panel: Panel;
      try { panel = JSON.parse(raw); } catch { continue; }
      if (panel?.version !== 1 || !panel.values || typeof panel.values !== 'object' || Array.isArray(panel.values)) continue;
      found = true;
      values = migrateValues(panel.values, version, values);
      baseValues = migrateValues(panel.baseValues ?? panel.values, version, baseValues);
      for (const preset of panel.presets ?? []) {
        presets.set(preset.id, {...preset, values: migrateValues(preset.values, version)});
      }
      // An empty auto-created v2 must not discard a selected legacy preset.
      if (panel.activePresetId) activePresetId = panel.activePresetId;
    }
    if (found) storage.setItem(target, JSON.stringify({version: 1, values, baseValues, activePresetId, presets: [...presets.values()]}));
  } catch { /* Restricted storage must not prevent rendering. */ }
}
