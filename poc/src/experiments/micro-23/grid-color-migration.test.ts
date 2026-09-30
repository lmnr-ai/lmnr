import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DialStore} from 'dialkit';
import {MICRO_23_CONTROLS_ID as id, MICRO_23_DEFAULTS} from './timeline';
import {GRID_COLOR_MIGRATION, migrateGridColor} from './grid-color-migration';

function fixture(color: string) {
  const store = new (DialStore.constructor as new () => typeof DialStore)();
  const config = (value: string) => ({gridColor: {type: 'color' as const, default: value}, dotDiameter: [8, 1, 16] as [number, number, number]});
  store.registerPanel(id, 'Appearance', config(color));
  store.registerPanel('unrelated-color-test', 'Other', {amount: 9});
  store.updatePanel(id, 'Appearance', config(MICRO_23_DEFAULTS.gridColor));
  const data = new Map<string, string>();
  const storage = {getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => {data.set(key, value);}};
  return {store, storage};
}

test('reproduces retained old defaults, then upgrades only the working color once', () => {
  for (const color of ['#333333', '#292929']) {
    const {store, storage} = fixture(color);
    assert.equal(store.getValue(id, 'gridColor'), color, 'changing code defaults alone retains the old value');
    store.savePreset(id, 'Preserve original color');
    store.clearActivePreset(id);
    const presets = JSON.stringify(store.getPresets(id));
    migrateGridColor(store, storage);
    assert.equal(store.getValue(id, 'gridColor'), '#1f1f1f');
    assert.equal(store.getValue(id, 'dotDiameter'), 8);
    assert.equal(store.getValue('unrelated-color-test', 'amount'), 9);
    assert.equal(JSON.stringify(store.getPresets(id)), presets);
    assert.equal(JSON.parse(storage.getItem(GRID_COLOR_MIGRATION)!).previousColor, color);
    store.updateValue(id, 'gridColor', color);
    migrateGridColor(store, storage);
    assert.equal(store.getValue(id, 'gridColor'), color, 'subsequent deliberate edits are respected');
  }
});

test('custom colors and active saved presets are not modified', () => {
  const custom = fixture('#445566');
  migrateGridColor(custom.store, custom.storage);
  assert.equal(custom.store.getValue(id, 'gridColor'), '#445566');
  const selected = fixture('#333333');
  const preset = selected.store.savePreset(id, 'Selected');
  const before = JSON.stringify(selected.store.getPresets(id));
  migrateGridColor(selected.store, selected.storage);
  assert.equal(selected.store.getValue(id, 'gridColor'), '#333333');
  assert.equal(selected.store.getActivePresetId(id), preset);
  assert.equal(JSON.stringify(selected.store.getPresets(id)), before);
});

test('unavailable storage cannot break the authoring panel', () => {
  const {store} = fixture('#333333');
  assert.doesNotThrow(() => migrateGridColor(store, {getItem: () => {throw new Error('blocked');}, setItem: () => {}}));
  assert.equal(store.getValue(id, 'gridColor'), '#333333');
});
