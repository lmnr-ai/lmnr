import assert from 'node:assert/strict';
import test from 'node:test';
import {CHAPTER_CONTROLS_ID, migrateMicro20Storage, migrateMicro20OddGridRadius, ODD_GRID_RADIUS_BACKUP, ODD_GRID_RADIUS_MIGRATION, migrateMicro20SpinnerSpeeds, SPINNER_SPEED_BACKUP, SPINNER_SPEED_MIGRATION} from './persistence';
import {LEGACY_MAIN_ID, MICRO_20_CONTROLS_ID, MICRO_20_ISSUES_TIMELINE_ID, MICRO_20_TIMELINE_ID, SPINNER_SPEED_KEYS, normalizeMicro20Controls} from './timeline';

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {values.set(key, value);}};
};
test('odd-grid radius migration changes only obsolete defaults, preserves metadata/custom values and original backup', () => {
  const storage = memoryStorage(), key = `dialkit:${MICRO_20_CONTROLS_ID}`;
  const original = JSON.stringify({version: 1, activePresetId: 'default', metadata: {note: 'keep'},
    values: {radialCircleRadius: 820, radialSoftness: .2, spinnerSpeed: 3},
    baseValues: {radialCircleRadius: 1000}, presets: [
      {id: 'default', name: 'Original', metadata: 'keep', values: {radialCircleRadius: 820}},
      {id: 'custom', name: 'Mine', values: {radialCircleRadius: 700}},
    ]});
  storage.setItem(key, original);
  storage.setItem('dialkit:micro-animation-15-controls-v1', 'untouched');
  migrateMicro20OddGridRadius(storage);
  const result = JSON.parse(storage.getItem(key)!);
  assert.equal(result.values.radialCircleRadius, 900);
  assert.equal(result.values.spinnerSpeed, 3);
  assert.equal(result.baseValues.radialCircleRadius, 1000);
  assert.equal(result.presets[0].values.radialCircleRadius, 900);
  assert.equal(result.presets[0].metadata, 'keep');
  assert.equal(result.presets[1].values.radialCircleRadius, 700);
  assert.equal(result.activePresetId, 'default');
  assert.deepEqual(result.metadata, {note: 'keep'});
  assert.equal(storage.getItem(ODD_GRID_RADIUS_BACKUP), original);
  const once = [...storage.values];
  migrateMicro20OddGridRadius(storage);
  assert.deepEqual([...storage.values], once);
  storage.setItem(key, original); // Explicit later import must win, even 820.
  migrateMicro20OddGridRadius(storage);
  assert.equal(storage.getItem(key), original);
  assert.equal(storage.getItem('dialkit:micro-animation-15-controls-v1'), 'untouched');
});
test('odd-grid migration marks fresh storage once and never rewrites later imports', () => {
  const storage = memoryStorage(), key = `dialkit:${MICRO_20_CONTROLS_ID}`;
  migrateMicro20OddGridRadius(storage);
  assert.ok(storage.getItem(ODD_GRID_RADIUS_MIGRATION));
  assert.equal(storage.getItem(ODD_GRID_RADIUS_BACKUP), null);
  const imported = JSON.stringify({version: 1, values: {radialCircleRadius: 820}});
  storage.setItem(key, imported);
  migrateMicro20OddGridRadius(storage);
  assert.equal(storage.getItem(key), imported);
});
test('odd-grid migration preserves custom current radius and migrates independent base default', () => {
  const storage = memoryStorage(), key = `dialkit:${MICRO_20_CONTROLS_ID}`;
  storage.setItem(key, JSON.stringify({version: 1, values: {radialCircleRadius: 777}, baseValues: {radialCircleRadius: 820}}));
  migrateMicro20OddGridRadius(storage);
  const result = JSON.parse(storage.getItem(key)!);
  assert.equal(result.values.radialCircleRadius, 777);
  assert.equal(result.baseValues.radialCircleRadius, 900);
});

test('stage speed migration preserves independent presets, explicit stage values, metadata and later imports', () => {
  const storage = memoryStorage(), key = `dialkit:${MICRO_20_CONTROLS_ID}`;
  const original = JSON.stringify({version: 1, activePresetId: 'slow', note: 'keep',
    values: {spinnerSpeed: 2.4, spinnerDescentSpeed: 0, radialCircleRadius: 937},
    baseValues: {spinnerSpeed: .7}, presets: [
      {id: 'slow', name: 'Slow', values: {spinnerSpeed: .3}},
      {id: 'custom', name: 'Custom', values: {spinnerSpeed: 4, spinnerZoomSpeed: 2}},
    ]});
  storage.setItem(key, original);
  migrateMicro20SpinnerSpeeds(storage);
  const result = JSON.parse(storage.getItem(key)!);
  assert.equal(result.activePresetId, 'slow'); assert.equal(result.note, 'keep');
  assert.equal(result.values.radialCircleRadius, 937);
  assert.equal(result.values.spinnerDescentSpeed, 0);
  assert.equal(result.values.spinnerEntrySpeed, 2.4);
  for (const field of SPINNER_SPEED_KEYS) {
    assert.equal(result.baseValues[field], .7);
    assert.equal(result.presets[0].values[field], .3);
    assert.equal(result.presets[1].values[field], field === 'spinnerZoomSpeed' ? 2 : 4);
  }
  assert.equal(storage.getItem(SPINNER_SPEED_BACKUP), original);
  const once = [...storage.values]; migrateMicro20SpinnerSpeeds(storage);
  assert.deepEqual([...storage.values], once);
  storage.setItem(key, original); migrateMicro20SpinnerSpeeds(storage);
  assert.equal(storage.getItem(key), original);
  // Explicit legacy export props normalize without writing storage.
  const legacy = normalizeMicro20Controls({spinnerSpeed: .8, spinnerDescentSpeed: 0});
  assert.equal(legacy.spinnerEntrySpeed, .8); assert.equal(legacy.spinnerDescentSpeed, 0);
});
test('stage migration marks fresh storage and preserves later complete imports', () => {
  const storage = memoryStorage(), key = `dialkit:${MICRO_20_CONTROLS_ID}`;
  migrateMicro20SpinnerSpeeds(storage); assert.ok(storage.getItem(SPINNER_SPEED_MIGRATION));
  const imported = JSON.stringify({version: 1, values: {spinnerEntrySpeed: 0, spinnerDescentSpeed: 4}});
  storage.setItem(key, imported); migrateMicro20SpinnerSpeeds(storage);
  assert.equal(storage.getItem(key), imported); assert.equal(storage.getItem(SPINNER_SPEED_BACKUP), null);
});

test('load-only migration preserves old values/presets and never clobbers a new import', () => {
  const main = {version: 1, values: {'bashDescent.at': 4, 'issueHandoff.at': 10}, presets: [{id: 'custom', name: 'My prelude', values: {'bashDescent.at': 5, 'issueHandoff.at': 12}}]};
  const issues = {version: 1, values: {'subtitleIssues.at': .2, 'subtitleIssues.from.progress': .3}, presets: [{id: 'custom', name: 'My issues', values: {'travelStart.at': 2}}]};
  const values = new Map<string, string>([
    [`dialkit:${LEGACY_MAIN_ID}`, JSON.stringify(main)], [`dialkit:${MICRO_20_ISSUES_TIMELINE_ID}`, JSON.stringify(issues)],
    ['dialkit:micro-animation-15-timeline-v3', 'untouched'],
  ]);
  const storage = {getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {values.set(key, value);}};
  migrateMicro20Storage(storage);
  assert.equal(values.get(`dialkit:${LEGACY_MAIN_ID}`), JSON.stringify(main));
  assert.equal(values.get(`dialkit:${MICRO_20_ISSUES_TIMELINE_ID}`), JSON.stringify(issues));
  assert.equal(values.get('dialkit:micro-animation-15-timeline-v3'), 'untouched');
  const migrated = JSON.parse(values.get(`dialkit:${MICRO_20_TIMELINE_ID}`)!);
  assert.equal(migrated.values['bashDescent.at'], 4);
  assert.equal(migrated.values['issues.subtitleIssues.at'], 7.7);
  assert.equal(migrated.values['issues.subtitleIssues.from.progress'], .3);
  assert.equal(migrated.presets.length, 2);
  assert.equal(migrated.presets[1].values['issues.travelStart.at'], 9.5);
  const marker = JSON.parse(values.get(`dialkit:${CHAPTER_CONTROLS_ID}`)!);
  assert.equal(marker.values.earliestHandoff, 10);
  assert.equal(marker.presets[0].values.earliestHandoff, 12);
  values.set(`dialkit:${MICRO_20_TIMELINE_ID}`, 'imported replacement');
  migrateMicro20Storage(storage);
  assert.equal(values.get(`dialkit:${MICRO_20_TIMELINE_ID}`), 'imported replacement');
});
