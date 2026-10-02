import {MICRO_15_TIMING} from '../micro-15/timeline';
import {ISSUE_KEYS} from '../micro-20/timeline';
import {ULTIMATE3_ISSUES_TIMELINE_ID} from '../micro-20/authoring';
import {issueEntryEnd, issuePostludeOffset, normalizeSettings, ULTIMATE_3_DEFAULTS} from './settings';
import {issuesTimelineValues} from './authoring';

export const ISSUES3_MIGRATION_ID = 'micro-animation-18-issues3-migration-v1';
export const ISSUES3_BACKUP_ID = 'micro-animation-18-issues3-original-v1';
const SETTINGS_ID = 'micro-animation-18-settings-v1';
const OLD_PANEL = 'dialkit:micro-animation-18-issues-timeline-v1';
const NEW_PANEL = `dialkit:${ULTIMATE3_ISSUES_TIMELINE_ID}`;
const LEGACY_ENTRY = {at: 0, duration: .5, from: {progress: 0}, to: {progress: 1},
  transition: {type: 'easing', duration: .5, ease: [0, 0, 1, 1]}};
const sameDefault = (value: any, fallback: any): boolean => value === undefined || (
  value !== null && typeof value === 'object' && fallback !== null && typeof fallback === 'object'
    ? Object.keys(value).length === Object.keys(fallback).length
      && Object.keys(value).every(key => sameDefault(value[key], fallback[key]))
    : value === fallback);
/** Missing fields are legacy defaults, but an authored curve/endpoint is not. */
const generatedEntry = (entry: any) => entry?.at === 0 && entry?.duration === .5
  && sameDefault(entry.transition, LEGACY_ENTRY.transition)
  && sameDefault(entry.from, LEGACY_ENTRY.from) && sameDefault(entry.to, LEGACY_ENTRY.to);
const generatedTiming = (timing: any) => Object.entries(MICRO_15_TIMING).every(([key, clip]) =>
  timing?.[key]?.at === clip.at && timing?.[key]?.duration === clip.duration
  && timing[key].transition === undefined && timing[key].from === undefined && timing[key].to === undefined);

/** Only storage load upgrades the old chapter. Explicit JSON imports are never
 * migrated. Keep the exact legacy chapter recoverable, and custom postlude
 * seconds remain postlude seconds, never prelude bars. */
export function migrateStoredIssues3(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const raw = input as any, old = raw.issues;
  if (!old || (old.sourceVersion === 20 || old.sourceVersion === 22)) return input;
  const defaults = ULTIMATE_3_DEFAULTS.issues;
  const generated = generatedTiming(old.timing);
  const leadIn = !old.leadIn || generatedEntry(old.leadIn) ? defaults.leadIn : {...LEGACY_ENTRY, ...old.leadIn};
  return {...raw, issues: {...defaults, leadIn,
    timing: generated ? defaults.timing : old.timing ?? defaults.timing,
    controls: {...defaults.controls, ...old.controls, warningAppearanceDuration: 0}, legacySource15: old}};
}

type Values = Record<string, any>;
type Saved = {values: Values; baseValues?: Values; presets?: {values: Values; [key: string]: any}[]; [key: string]: any};
export function migrateIssues3Storage(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  if (storage.getItem(ISSUES3_MIGRATION_ID)) return;
  const originalSettings = storage.getItem(SETTINGS_ID), originalPanel = storage.getItem(OLD_PANEL);
  const originals = {settings: originalSettings, timeline: originalPanel,
    controls: storage.getItem('dialkit:micro-animation-18-issues-controls-v1')};
  if (!storage.getItem(ISSUES3_BACKUP_ID)) storage.setItem(ISSUES3_BACKUP_ID, JSON.stringify(originals));
  const original = JSON.parse(originalSettings ?? 'null');
  const settings = normalizeSettings(migrateStoredIssues3(original));
  if (original) storage.setItem(SETTINGS_ID, JSON.stringify(settings));
  // Leave old records intact. Never overwrite an already imported new panel.
  if (!storage.getItem(NEW_PANEL) && originalPanel) {
    const saved = JSON.parse(originalPanel) as Saved;
    const migrate = (values: Values): Values => {
      const oldLead = (values['leadIn.at'] ?? original?.issues?.leadIn?.at ?? 0)
        + (values['leadIn.duration'] ?? original?.issues?.leadIn?.duration ?? .5);
      const oldTiming = Object.fromEntries(ISSUE_KEYS.map(key => [key, {
        at: (values[`${key}.at`] ?? oldLead + (original?.issues?.timing?.[key]?.at ?? MICRO_15_TIMING[key].at)) - oldLead,
        duration: values[`${key}.duration`] ?? original?.issues?.timing?.[key]?.duration ?? MICRO_15_TIMING[key].duration,
      }]));
      const allGenerated = ISSUE_KEYS.every(key => Math.abs(oldTiming[key].at - MICRO_15_TIMING[key].at) < 1e-9 && oldTiming[key].duration === MICRO_15_TIMING[key].duration);
      const oldEntry = {...LEGACY_ENTRY, ...original?.issues?.leadIn,
        at: values['leadIn.at'] ?? original?.issues?.leadIn?.at ?? 0,
        duration: values['leadIn.duration'] ?? original?.issues?.leadIn?.duration ?? .5,
        transition: values['leadIn.transition'] ?? original?.issues?.leadIn?.transition ?? LEGACY_ENTRY.transition,
        from: {progress: values['leadIn.from.progress'] ?? original?.issues?.leadIn?.from?.progress ?? 0},
        to: {progress: values['leadIn.to.progress'] ?? original?.issues?.leadIn?.to?.progress ?? 1}};
      const entryIsGenerated = generatedEntry(oldEntry);
      const entrySettings = normalizeSettings({...settings, issues: {...settings.issues,
        leadIn: entryIsGenerated ? ULTIMATE_3_DEFAULTS.issues.leadIn : oldEntry}});
      const next = issuesTimelineValues(entrySettings);
      const shift = issueEntryEnd(entrySettings) - issueEntryEnd(settings);
      for (const [path, value] of Object.entries(values)) {
        const [key] = path.split('.');
        if (ISSUE_KEYS.includes(key as any)) {
          // Generated seconds adopt source20 defaults; custom curves/endpoints survive.
          if (allGenerated && (path.endsWith('.at') || path.endsWith('.duration'))) continue;
          next[`postlude_${path}`] = path.endsWith('.at') && typeof value === 'number'
            ? value - oldLead + issuePostludeOffset(settings) + shift : value;
        } else if (path.startsWith('leadIn.') && !['leadIn.at', 'leadIn.duration'].includes(path) && !entryIsGenerated) next[path] = value;
      }
      return next;
    };
    storage.setItem(NEW_PANEL, JSON.stringify({...saved, values: migrate(saved.values ?? {}),
      ...(saved.baseValues ? {baseValues: migrate(saved.baseValues)} : {}),
      ...(saved.presets ? {presets: saved.presets.map(preset => ({...preset, values: migrate(preset.values)}))} : {})}));
  }
  storage.setItem(ISSUES3_MIGRATION_ID, '1');
}
