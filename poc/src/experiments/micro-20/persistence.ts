import {ISSUE_START, LEGACY_MAIN_ID, MICRO_20_CONTROLS_ID, MICRO_20_DEFAULTS, MICRO_20_ISSUES_TIMELINE_ID, MICRO_20_TIMELINE_ID, SPINNER_SPEED_KEYS} from './timeline';

export const CHAPTER_CONTROLS_ID = 'micro-animation-20-chapter-controls-v1';
const key = (id: string) => `dialkit:${id}`;
type Values = Record<string, unknown>;
type Saved = {version: number; values: Values; baseValues?: Values; presets?: {id: string; name: string; values: Values}[]; activePresetId?: string};
const read = (storage: Pick<Storage, 'getItem'>, id: string): Saved | null => {
  try {
    const value = JSON.parse(storage.getItem(key(id)) ?? 'null');
    return value?.version === 1 && value.values && typeof value.values === 'object' ? value : null;
  } catch {return null;}
};
export const SPINNER_SPEED_MIGRATION = 'micro20:stage-spinner-speeds-v1';
export const SPINNER_SPEED_BACKUP = 'micro20:stage-spinner-speeds-original-v1';
/** Load-only split of the old magnitude into independent stage magnitudes.
 * A state's explicit new fields always win, including zero. Back up the full
 * original record before DialKit drops the now-hidden legacy spinnerSpeed. */
export function migrateMicro20SpinnerSpeeds(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  if (storage.getItem(SPINNER_SPEED_MIGRATION)) return;
  const original = storage.getItem(key(MICRO_20_CONTROLS_ID));
  const saved = read(storage, MICRO_20_CONTROLS_ID);
  if (saved) {
    const migrate = (values: Values): Values => {
      const legacy = typeof values.spinnerSpeed === 'number' && Number.isFinite(values.spinnerSpeed)
        ? Math.max(0, Math.min(10, values.spinnerSpeed)) : MICRO_20_DEFAULTS.spinnerEntrySpeed;
      return {...values, ...Object.fromEntries(SPINNER_SPEED_KEYS.map(field => [field, values[field] ?? legacy]))};
    };
    const next = {...saved, values: migrate(saved.values),
      ...(saved.baseValues ? {baseValues: migrate(saved.baseValues)} : {}),
      ...(saved.presets ? {presets: saved.presets.map(preset => ({...preset, values: migrate(preset.values)}))} : {}),
    };
    if (original && !storage.getItem(SPINNER_SPEED_BACKUP)) storage.setItem(SPINNER_SPEED_BACKUP, original);
    storage.setItem(key(MICRO_20_CONTROLS_ID), JSON.stringify(next));
  }
  storage.setItem(SPINNER_SPEED_MIGRATION, '1');
}
export const ODD_GRID_RADIUS_MIGRATION = 'micro20:odd-grid-radius-migration-v1';
export const ODD_GRID_RADIUS_BACKUP = 'micro20:odd-grid-radius-original-v1';
/** One load-only default correction. Mark even fresh storage so explicit later
 * imports (including radius 820) always win. Custom radii remain honest pixels. */
export function migrateMicro20OddGridRadius(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  if (storage.getItem(ODD_GRID_RADIUS_MIGRATION)) return;
  const original = storage.getItem(key(MICRO_20_CONTROLS_ID));
  const saved = read(storage, MICRO_20_CONTROLS_ID);
  if (saved) {
    const migrate = (values: Values): Values => values.radialCircleRadius === 820
      ? {...values, radialCircleRadius: MICRO_20_DEFAULTS.radialCircleRadius} : values;
    const next = {...saved, values: migrate(saved.values),
      ...(saved.baseValues ? {baseValues: migrate(saved.baseValues)} : {}),
      ...(saved.presets ? {presets: saved.presets.map(preset => ({...preset, values: migrate(preset.values)}))} : {}),
    };
    if (!storage.getItem(ODD_GRID_RADIUS_BACKUP) && original) storage.setItem(ODD_GRID_RADIUS_BACKUP, original);
    storage.setItem(key(MICRO_20_CONTROLS_ID), JSON.stringify(next));
  }
  storage.setItem(ODD_GRID_RADIUS_MIGRATION, JSON.stringify({from: 820, to: MICRO_20_DEFAULTS.radialCircleRadius, originalsPreserved: true}));
}
/** Read before first registration for correct initial authored duration.
 * The scoped authoring adapter, not config defaults, preserves stored curves. */
export function readMicro20Values(storage: Pick<Storage, 'getItem'>): Values {
  return read(storage, MICRO_20_TIMELINE_ID)?.values ?? {};
}

/** Load-only schema migration. Originals are the backup; existing v2 imports win. */
export function migrateMicro20Storage(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  if (storage.getItem(key(MICRO_20_TIMELINE_ID))) return;
  const main = read(storage, LEGACY_MAIN_ID), issues = read(storage, MICRO_20_ISSUES_TIMELINE_ID);
  if (!main && !issues) return;
  const mapIssues = (values: Values = {}) => Object.fromEntries(Object.entries(values).map(([path, value]) => [
    `issues.${path}`, path.endsWith('.at') && typeof value === 'number' ? value + ISSUE_START : value,
  ]));
  const combine = (values: Values = {}, issueValues: Values = {}) => ({...values, ...mapIssues(issueValues)});
  const saved: Saved = {
    version: 1, values: combine(main?.values, issues?.values),
    baseValues: combine(main?.baseValues ?? main?.values, issues?.baseValues ?? issues?.values),
    presets: [
      ...(main?.presets ?? []).map(preset => ({...preset, values: combine(preset.values, issues?.values)})),
      ...(issues?.presets ?? []).map(preset => ({...preset, id: `issues-${preset.id}`, name: `Issues · ${preset.name}`, values: combine(main?.values, preset.values)})),
    ],
    activePresetId: main?.activePresetId,
  };
  storage.setItem(key(MICRO_20_TIMELINE_ID), JSON.stringify(saved));
  storage.setItem('micro20:single-clock-migration-v1', JSON.stringify({from: [LEGACY_MAIN_ID, MICRO_20_ISSUES_TIMELINE_ID], originalsPreserved: true}));
  if (!storage.getItem(key(CHAPTER_CONTROLS_ID))) {
    const markerValues = (values: Values = {}) => ({earliestHandoff: typeof values['issueHandoff.at'] === 'number' ? values['issueHandoff.at'] : ISSUE_START});
    storage.setItem(key(CHAPTER_CONTROLS_ID), JSON.stringify({
      version: 1, values: markerValues(main?.values), baseValues: markerValues(main?.baseValues ?? main?.values),
      activePresetId: main?.activePresetId,
      presets: (main?.presets ?? []).map(preset => ({...preset, name: `Handoff · ${preset.name}`, values: markerValues(preset.values)})),
    }));
  }
}
