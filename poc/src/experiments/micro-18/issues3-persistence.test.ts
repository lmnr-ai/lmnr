import assert from 'node:assert/strict';
import test from 'node:test';
import {DialStore} from 'dialkit';
import {parseTimelineConfig} from 'dialkit/timeline';
import {MICRO_15_DEFAULTS, MICRO_15_TIMING} from '../micro-15/timeline';
import {installMicro20AuthoringCompatibility, ULTIMATE3_ISSUES_TIMELINE_ID} from '../micro-20/authoring';
import {issuesTimelineConfig} from './authoring';
import {issuePostludeOffset, normalizeSettings, SETTINGS_STORAGE_ID, ULTIMATE_3_DEFAULTS} from './settings';
import {ISSUES3_BACKUP_ID, ISSUES3_MIGRATION_ID, migrateIssues3Storage, migrateStoredIssues3} from './issues3-persistence';

const storage = () => {
  const data = new Map<string, string>();
  return {data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => {data.set(key, value);}};
};
const legacy = () => ({...structuredClone(ULTIMATE_3_DEFAULTS), allocations: {...ULTIMATE_3_DEFAULTS.allocations, issues: 7.5},
  issues: {leadIn: {at: 0, duration: .5}, timing: MICRO_15_TIMING, controls: MICRO_15_DEFAULTS}});
const oldKey = 'dialkit:micro-animation-18-issues-timeline-v1', newKey = `dialkit:${ULTIMATE3_ISSUES_TIMELINE_ID}`;

test('load-only migration backs up originals, separates old postlude from new prelude, retains custom settings and all preset states', () => {
  const store = storage(), old = legacy();
  old.flow.controls.blueDotScale = 2;
  store.setItem(SETTINGS_STORAGE_ID, JSON.stringify(old));
  const flat = Object.fromEntries(Object.entries(MICRO_15_TIMING).flatMap(([key, clip]) => [[`${key}.at`, clip.at + .5], [`${key}.duration`, clip.duration]]));
  const saved = {version: 1, values: flat, baseValues: {...flat, 'promptTyping.at': 6}, activePresetId: 'a',
    presets: [{id: 'a', name: 'Custom', values: {...flat, 'promptTyping.at': 7, 'promptTyping.from.progress': .3,
      'promptTyping.transition': {type: 'spring', bounce: .4}}}]};
  store.setItem(oldKey, JSON.stringify(saved)); store.setItem('user-unrelated', 'untouched');
  migrateIssues3Storage(store);
  const next = JSON.parse(store.getItem(SETTINGS_STORAGE_ID)!);
  assert.equal(next.issues.sourceVersion, 20);
  assert.equal(next.flow.controls.blueDotScale, 2);
  assert.deepEqual(next.issues.legacySource15, old.issues);
  assert.deepEqual(next.issues.preludeTiming, ULTIMATE_3_DEFAULTS.issues.preludeTiming);
  const panel = JSON.parse(store.getItem(newKey)!);
  assert.ok(!('promptTyping.at' in panel.values));
  assert.ok('prelude_blueBashEntry.at' in panel.values);
  assert.equal(panel.baseValues['postlude_promptTyping.at'], 5.5 + issuePostludeOffset(next));
  assert.equal(panel.presets[0].values['postlude_promptTyping.at'], 6.5 + issuePostludeOffset(next));
  assert.equal(panel.presets[0].values['postlude_promptTyping.from.progress'], .3);
  assert.equal(panel.activePresetId, 'a');
  assert.equal(store.getItem(oldKey), JSON.stringify(saved));
  assert.equal(JSON.parse(store.getItem(ISSUES3_BACKUP_ID)!).settings, JSON.stringify(old));
  assert.equal(store.getItem('user-unrelated'), 'untouched');
  const before = JSON.stringify([...store.data]); migrateIssues3Storage(store); assert.equal(JSON.stringify([...store.data]), before);
  assert.equal(store.getItem(ISSUES3_MIGRATION_ID), '1');
  store.setItem(SETTINGS_STORAGE_ID, JSON.stringify(old));
  migrateIssues3Storage(store);
  assert.equal(store.getItem(SETTINGS_STORAGE_ID), JSON.stringify(old), 'later explicit imports remain authoritative');
});

test('custom old timing remains postlude seconds, new version and existing new panel are authoritative', () => {
  const old = legacy(); old.issues.timing = {...old.issues.timing, promptTyping: {at: 8, duration: .7}};
  const migrated = normalizeSettings(migrateStoredIssues3(old));
  assert.equal(migrated.issues.timing.promptTyping.at, 8);
  assert.equal(normalizeSettings(old).issues.leadIn.duration, .5, 'normalization is not load migration');
  assert.equal(migrateStoredIssues3(migrated), migrated);
  const store = storage(); store.setItem(oldKey, JSON.stringify({values: {}})); store.setItem(newKey, 'imported');
  migrateIssues3Storage(store); assert.equal(store.getItem(newKey), 'imported');
});

const fresh = () => new (DialStore.constructor as new () => typeof DialStore)();
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
test('opted-in real DialStore preserves current/base/inactive preset curves and endpoints on update/reload/reset; foreign panels stay native', () => {
  const id = ULTIMATE3_ISSUES_TIMELINE_ID, path = 'postlude_subtitleReady.transition';
  const config = parseTimelineConfig(issuesTimelineConfig(normalizeSettings(ULTIMATE_3_DEFAULTS)) as any).dialConfig;
  const seed = fresh(); seed.registerPanel(id, 'seed', config); seed.updatePanel(id, 'seed', config);
  const defaults = clone(seed.getValues(id));
  const a = {...defaults, [path]: {type: 'easing', duration: 2, ease: [.2, 0, .8, 1]}, [`${path}.__mode`]: 'easing', 'postlude_subtitleReady.from.progress': .27};
  const b = {...defaults, [path]: {type: 'spring', bounce: .6, visualDuration: 1.7}, [`${path}.__mode`]: 'simple', 'postlude_subtitleReady.to.progress': .73};
  const base = {...defaults, [path]: {type: 'spring', stiffness: 120, damping: 12, mass: 1}, [`${path}.__mode`]: 'advanced'};
  const saved = {version: 1, values: a, baseValues: base, activePresetId: 'a', presets: [{id: 'a', name: 'A', values: a}, {id: 'b', name: 'B', values: b}]};
  const store = storage(); store.setItem(newKey, JSON.stringify(saved));
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {configurable: true, value: {localStorage: store}});
  try {
    const options = {persist: true, kind: 'timeline' as const, retainOnUnmount: true};
    let dial = fresh(); installMicro20AuthoringCompatibility(dial, undefined, true);
    const reconcile = (dial as any).reconcileValues, persist = (dial as any).persistPanel;
    dial.registerPanel(id, 'issues', config, undefined, options); dial.updatePanel(id, 'issues', config, undefined, options);
    assert.deepEqual(dial.getValues(id), a); assert.deepEqual(dial.getPresets(id), saved.presets);
    assert.deepEqual(JSON.parse(store.getItem(newKey)!).baseValues, base);
    assert.equal((dial as any).reconcileValues, reconcile); assert.equal((dial as any).persistPanel, persist);
    dial.unregisterPanel(id); dial = fresh(); installMicro20AuthoringCompatibility(dial, undefined, true);
    dial.registerPanel(id, 'issues', config, undefined, options);
    dial.loadPreset(id, 'b'); dial.updatePanel(id, 'issues', config, undefined, options);
    assert.deepEqual(dial.getValues(id), b); assert.deepEqual(dial.getPresets(id), saved.presets);
    dial.clearActivePreset(id); assert.deepEqual(dial.getValues(id), base);
    dial.resetValues(id); assert.deepEqual(dial.getPresets(id), saved.presets);
    const reset = fresh(); reset.registerPanel(id, 'reset', config); assert.deepEqual(dial.getValues(id), reset.getValues(id));
    const foreign = 'micro18-unrelated-test';
    const native = fresh(); native.registerPanel(foreign, 'native', config); native.updatePanel(foreign, 'native', config);
    dial.registerPanel(foreign, 'foreign', config); dial.updatePanel(foreign, 'foreign', config);
    assert.deepEqual(dial.getValues(foreign), native.getValues(foreign));
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('legacy default entry timing does not erase authored curves or endpoints in settings/current/base/inactive presets', () => {
  const authoredEntries = [
    {at: 0, duration: .5, transition: {type: 'spring', bounce: .6}},
    {at: 0, duration: .5, from: {progress: .2}, to: {progress: .8}},
  ];
  for (const leadIn of authoredEntries) {
    const old = {...legacy(), issues: {...legacy().issues, leadIn}};
    const migrated = normalizeSettings(migrateStoredIssues3(old));
    assert.equal(migrated.issues.leadIn.duration, .5);
    if (leadIn.transition) assert.deepEqual(migrated.issues.leadIn.transition, leadIn.transition);
    else assert.deepEqual(migrated.issues.leadIn.transition, {type: 'easing', duration: .5, ease: [0, 0, 1, 1]});
    if (leadIn.from) assert.deepEqual(migrated.issues.leadIn.from, leadIn.from);
    if (leadIn.to) assert.deepEqual(migrated.issues.leadIn.to, leadIn.to);
  }
  const store = storage();
  store.setItem(SETTINGS_STORAGE_ID, JSON.stringify(legacy()));
  const values = {'leadIn.at': 0, 'leadIn.duration': .5,
    'leadIn.transition': {type: 'spring', bounce: .6}, 'leadIn.transition.__mode': 'simple'};
  const baseValues = {'leadIn.at': 0, 'leadIn.duration': .5, 'leadIn.from.progress': .2};
  const inactive = {'leadIn.at': 0, 'leadIn.duration': .5, 'leadIn.to.progress': .8};
  store.setItem(oldKey, JSON.stringify({values, baseValues, presets: [{id: 'inactive', values: inactive}]}));
  migrateIssues3Storage(store);
  const panel = JSON.parse(store.getItem(newKey)!);
  for (const [before, after] of [[values, panel.values], [baseValues, panel.baseValues], [inactive, panel.presets[0].values]]) {
    for (const [path, value] of Object.entries(before)) assert.deepEqual(after[path], value, path);
  }
  const entrySettings = normalizeSettings({...ULTIMATE_3_DEFAULTS, issues: {...ULTIMATE_3_DEFAULTS.issues,
    leadIn: {at: 0, duration: .5, transition: values['leadIn.transition']}}});
  assert.equal(panel.values['postlude_promptTyping.at'], issuePostludeOffset(entrySettings) + entrySettings.issues.timing.promptTyping.at);
});

test('complete known legacy linear entry defaults adopt the new entry in settings and presets', () => {
  const leadIn = {at: 0, duration: .5, from: {progress: 0}, to: {progress: 1},
    transition: {type: 'easing', duration: .5, ease: [0, 0, 1, 1]}};
  const old = {...legacy(), issues: {...legacy().issues, leadIn}};
  assert.deepEqual(normalizeSettings(migrateStoredIssues3(old)).issues.leadIn, ULTIMATE_3_DEFAULTS.issues.leadIn);
  const store = storage(); store.setItem(SETTINGS_STORAGE_ID, JSON.stringify(old));
  const values = {'leadIn.at': 0, 'leadIn.duration': .5, 'leadIn.transition': leadIn.transition,
    'leadIn.from.progress': 0, 'leadIn.to.progress': 1};
  store.setItem(oldKey, JSON.stringify({values, baseValues: values, presets: [{id: 'default', values}]}));
  migrateIssues3Storage(store);
  const panel = JSON.parse(store.getItem(newKey)!);
  for (const next of [panel.values, panel.baseValues, panel.presets[0].values]) {
    assert.equal(next['leadIn.duration'], 1.2);
    assert.deepEqual(next['leadIn.transition'], ULTIMATE_3_DEFAULTS.issues.leadIn.transition);
  }
});
