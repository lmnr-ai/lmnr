import assert from 'node:assert/strict';
import test from 'node:test';
import {CURRENT_CUT_BACKUP, CURRENT_MIX_ID, CURRENT_SOUNDTRACK, loadCurrentVoiceoverSettings, normalizeCurrentVoiceoverSettings, readCurrentVoiceoverSettings} from './current-cut';
import {normalizeSettings, ULTIMATE_3_DEFAULTS} from './settings';
import {VOICEOVER_DEFAULTS, VOICEOVER_SETTINGS_ID} from './voiceover-cut';
import {ultimate3DurationFrames} from './sample';

const saved = (value: unknown) => ({getItem: (key: string) => key === VOICEOVER_SETTINGS_ID ? JSON.stringify(value) : null});

test('the actual current-cut loader supplies 3px spinners and the laminar.sh ending to a fresh browser', () => {
  const settings = readCurrentVoiceoverSettings({getItem: () => null});
  assert.equal(settings.cost.controls.cheapSpinnerStrokeWidth, 3);
  assert.equal(settings.paperTexture, false);
  assert.equal(ultimate3DurationFrames(settings), 2265);
});

test('an existing browser upgrades the obsolete generated spinner without needing a JSON import', () => {
  const settings = readCurrentVoiceoverSettings(saved(VOICEOVER_DEFAULTS));
  assert.equal(settings.cost.controls.cheapSpinnerStrokeWidth, 3);
  assert.equal(ultimate3DurationFrames(settings), 2265);
  assert.deepEqual(settings.voiceover, VOICEOVER_DEFAULTS.voiceover);
});

test('custom controls, custom ending and paper choice survive the one-time migration', () => {
  const custom = {...VOICEOVER_DEFAULTS, paperTexture: true, cost: {...VOICEOVER_DEFAULTS.cost,
    controls: {...VOICEOVER_DEFAULTS.cost.controls, cheapSpinnerStrokeWidth: 2.25}},
    conclusion: {...VOICEOVER_DEFAULTS.conclusion, logo: {...VOICEOVER_DEFAULTS.conclusion.logo, duration: 4}}};
  const result = readCurrentVoiceoverSettings(saved(custom));
  assert.deepEqual(result.cost.controls, custom.cost.controls);
  for (const key of Object.keys(custom.cost.timing) as (keyof typeof custom.cost.timing)[]) {
    assert.equal(result.cost.timing[key].at, custom.cost.timing[key].at + 1.5);
    assert.deepEqual({...result.cost.timing[key], at: 0}, {...custom.cost.timing[key], at: 0});
  }
  assert.deepEqual(result.conclusion, custom.conclusion);
  assert.equal(result.paperTexture, true);
});

test('the actual edition import normalizer protects literal old values on later reload', () => {
  const imported = normalizeCurrentVoiceoverSettings(VOICEOVER_DEFAULTS);
  assert.equal(imported.cost.controls.cheapSpinnerStrokeWidth, 1.5);
  assert.deepEqual(readCurrentVoiceoverSettings(saved(imported)), imported);
  assert.equal(normalizeSettings(imported).currentCutVersion, 1, 'authoring edits retain the marker');
  const historical = normalizeCurrentVoiceoverSettings(ULTIMATE_3_DEFAULTS);
  assert.equal(readCurrentVoiceoverSettings(saved(historical)).cost.controls.cheapSpinnerStrokeWidth, 1.5);
});

function memory(settings = VOICEOVER_DEFAULTS, soundtrack = 'arabesque', activePresetId: string | null = null) {
  const values = new Map<string, string>([
    [VOICEOVER_SETTINGS_ID, JSON.stringify(settings)],
    [`dialkit:${CURRENT_MIX_ID}`, JSON.stringify({version: 1, values: {masterVolume: 4.2, soundtrack},
      baseValues: {masterVolume: 6.98, soundtrack: 'arabesque'}, presets: [{id: 'kept'}], activePresetId})],
  ]);
  return {getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {values.set(key, value);}};
}

test('entrypoint backs up old state, installs the current mix, and is idempotent', () => {
  const storage = memory();
  const first = loadCurrentVoiceoverSettings(storage);
  assert.equal(storage.getItem(CURRENT_CUT_BACKUP), JSON.stringify(VOICEOVER_DEFAULTS));
  const key = `dialkit:${CURRENT_MIX_ID}`;
  const mix = JSON.parse(storage.getItem(key)!);
  assert.equal(mix.values.soundtrack, CURRENT_SOUNDTRACK);
  assert.equal(mix.values.masterVolume, 4.2);
  assert.deepEqual(mix.baseValues, {masterVolume: 6.98, soundtrack: 'arabesque'});
  assert.deepEqual(mix.presets, [{id: 'kept'}]);
  assert.deepEqual(loadCurrentVoiceoverSettings(storage), first);
  // Choosing Arabesque or a thin stroke after the upgrade must remain an edit.
  storage.setItem(key, JSON.stringify({...mix, values: {...mix.values, soundtrack: 'arabesque'}}));
  storage.setItem(VOICEOVER_SETTINGS_ID, JSON.stringify({...first, cost: {...first.cost, controls: {...first.cost.controls, cheapSpinnerStrokeWidth: 1.5}}}));
  assert.equal(loadCurrentVoiceoverSettings(storage).cost.controls.cheapSpinnerStrokeWidth, 1.5);
  assert.equal(JSON.parse(storage.getItem(key)!).values.soundtrack, 'arabesque');
});

test('non-default soundtrack choices and active mix presets are not overwritten', () => {
  for (const [soundtrack, preset] of [['glide', null], ['arabesque', 'kept']] as const) {
    const storage = memory(VOICEOVER_DEFAULTS, soundtrack, preset);
    loadCurrentVoiceoverSettings(storage);
    assert.equal(JSON.parse(storage.getItem(`dialkit:${CURRENT_MIX_ID}`)!).values.soundtrack, soundtrack);
  }
});

test('a stored cursor-v4 selection follows the cut onto the laminar.sh bed once', () => {
  const key = `dialkit:${CURRENT_MIX_ID}`;
  const storage = memory(VOICEOVER_DEFAULTS, 'cursor-v4');
  const settings = loadCurrentVoiceoverSettings(storage);
  assert.ok(settings.conclusion.url);
  assert.equal(JSON.parse(storage.getItem(key)!).values.soundtrack, CURRENT_SOUNDTRACK);
  // Picking v4 again on the url cut, a preset, or an authored ending without the card, stays literal.
  storage.setItem(key, JSON.stringify({...JSON.parse(storage.getItem(key)!), values: {soundtrack: 'cursor-v4'}}));
  loadCurrentVoiceoverSettings(storage);
  assert.equal(JSON.parse(storage.getItem(key)!).values.soundtrack, 'cursor-v4');
  const authored = {...VOICEOVER_DEFAULTS, conclusion: {...VOICEOVER_DEFAULTS.conclusion, logo: {...VOICEOVER_DEFAULTS.conclusion.logo, duration: 4}}};
  for (const [stored, preset] of [[VOICEOVER_DEFAULTS, 'kept'], [authored, null]] as const) {
    const other = memory(stored, 'cursor-v4', preset);
    loadCurrentVoiceoverSettings(other);
    assert.equal(JSON.parse(other.getItem(key)!).values.soundtrack, 'cursor-v4');
  }
});
