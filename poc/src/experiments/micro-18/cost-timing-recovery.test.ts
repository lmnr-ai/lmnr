import assert from 'node:assert/strict';
import test from 'node:test';
import profile from '../../../handoff/glide-linger-current/settings.json';
import {normalizeSettings} from './settings';
import {COST_LEAD_IN_BACKUP, COST_TIMING_RECOVERY_BACKUP, COST_LEAD_IN_DEFAULTS as CURRENT_VOICEOVER_DEFAULTS, loadCurrentVoiceoverSettings, migrateVoiceoverTake, normalizeCurrentVoiceoverSettings} from './current-cut';
import {VOICEOVER_SETTINGS_ID} from './voiceover-cut';
import {sampleUltimate3} from './sample';
import {voiceoverSchedule} from './voiceover-schedule';

const before = normalizeSettings(profile);
const store = (raw: unknown) => {
  const values = new Map([[VOICEOVER_SETTINGS_ID, JSON.stringify(raw)], [COST_LEAD_IN_BACKUP, JSON.stringify(before)]]);
  return {getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {values.set(key, value);}};
};

test('recover the observed partial hot-reload migration: shifted boundary with stale Cost clips', () => {
  // The previous pass observed this combination in a live authoring session.
  const partial = {...CURRENT_VOICEOVER_DEFAULTS, costTimingRecoveryVersion: undefined, cost: before.cost, pacing: before.pacing};
  const storage = store(partial);
  const actual = loadCurrentVoiceoverSettings(storage);
  for (const key of Object.keys(before.cost.timing) as (keyof typeof before.cost.timing)[]) {
    assert.ok(Math.abs(actual.cost.timing[key].at - before.cost.timing[key].at - 1.5) < 1e-9,
      `${key}: each Cost animation must move +1.5 local seconds`);
  }
  // These are editable-v11 settings, so their generated slots also move onto the October 2 take.
  assert.deepEqual(voiceoverSchedule(actual), voiceoverSchedule(migrateVoiceoverTake(before)));
  for (const time of [19.65, 20.2, 20.7, 21.5, 22, 23, 25, 27]) {
    const old = sampleUltimate3(time, before).cost!;
    const next = sampleUltimate3(time, actual).cost!;
    for (const key of Object.keys(old.progress) as (keyof typeof old.progress)[]) {
      assert.ok(Math.abs(old.progress[key] - next.progress[key]) < 1e-8, `${key} at global ${time}`);
    }
  }
  assert.deepEqual(loadCurrentVoiceoverSettings(storage), actual, 'repair must only run once');
  assert.equal(storage.getItem(COST_TIMING_RECOVERY_BACKUP), JSON.stringify(partial));
});

test('repair preserves earlier cloud reveal and already-shifted/custom action bars', () => {
  const partial = {...CURRENT_VOICEOVER_DEFAULTS, costTimingRecoveryVersion: undefined, pacing: before.pacing,
    cost: {...before.cost, timing: {...before.cost.timing,
      cloudSweep: {...before.cost.timing.cloudSweep, at: .12, duration: .92},
      cheapLegTwoLeft: {...before.cost.timing.cheapLegTwoLeft, at: 2.7},
      cheapLegThreeRight: CURRENT_VOICEOVER_DEFAULTS.cost.timing.cheapLegThreeRight,
    }}};
  const repaired = loadCurrentVoiceoverSettings(store(partial));
  assert.equal(repaired.cost.timing.cheapLegOneRight.at, 2.04);
  assert.equal(repaired.cost.timing.cheapLegTwoLeft.at, 2.7);
  assert.equal(repaired.cost.timing.cheapLegThreeRight.at, 3);
  assert.deepEqual(repaired.cost.timing.cloudSweep, partial.cost.timing.cloudSweep);
});

test('literal imports, later edits and a single intentionally earlier bar are not repaired', () => {
  const partial = {...CURRENT_VOICEOVER_DEFAULTS, costTimingRecoveryVersion: undefined, cost: before.cost, pacing: before.pacing};
  const imported = normalizeCurrentVoiceoverSettings(partial);
  assert.deepEqual(loadCurrentVoiceoverSettings(store(imported)), imported);
  const laterEdit = {...CURRENT_VOICEOVER_DEFAULTS, cost: before.cost};
  assert.deepEqual(loadCurrentVoiceoverSettings(store(laterEdit)), migrateVoiceoverTake(laterEdit));
  const oneEarlier = {...CURRENT_VOICEOVER_DEFAULTS, costTimingRecoveryVersion: undefined,
    cost: {...CURRENT_VOICEOVER_DEFAULTS.cost, timing: {...CURRENT_VOICEOVER_DEFAULTS.cost.timing, cheapLegOneRight: before.cost.timing.cheapLegOneRight}}};
  assert.deepEqual(loadCurrentVoiceoverSettings(store(oneEarlier)).cost.timing, oneEarlier.cost.timing);
});
