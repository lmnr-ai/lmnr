import {MICRO_15_DEFAULTS} from './timeline';

export const MICRO_15_CONTROLS_ID = 'micro-animation-15-direct-v4';
export const OLD_CONTROLS_KEY = 'dialkit:micro-animation-15-direct-v3';
export const LEGACY_CONTROLS_KEY = 'dialkit:micro-animation-15-direct-v2';
export const CONTROLS_KEY = `dialkit:${MICRO_15_CONTROLS_ID}`;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

// Start the retimed authoring pass with its seven-second duration while retaining
// the user's appearance/travel controls and presets. The new panel ID prevents
// an older persisted 16.5-second duration from silently overriding this default.
export function migrateAgentControls(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  if (storage.getItem(CONTROLS_KEY)) return;
  const raw = storage.getItem(OLD_CONTROLS_KEY) ?? storage.getItem(LEGACY_CONTROLS_KEY);
  if (!raw) return;
  let saved: unknown;
  try {saved = JSON.parse(raw);} catch {return;}
  if (!record(saved) || saved.version !== 1 || !record(saved.values)) return;
  const retime = (values: Record<string, unknown>) => ({...values, timelineDuration: MICRO_15_DEFAULTS.timelineDuration});
  storage.setItem(CONTROLS_KEY, JSON.stringify({...saved,
    values: retime(saved.values),
    baseValues: retime(record(saved.baseValues) ? saved.baseValues : saved.values),
    ...(Array.isArray(saved.presets) ? {presets: saved.presets.map(preset => record(preset) && record(preset.values)
      ? {...preset, values: retime(preset.values)} : preset)} : {}),
  }));
}
