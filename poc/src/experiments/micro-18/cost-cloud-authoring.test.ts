import assert from 'node:assert/strict';
import test from 'node:test';
import profile from '../../../handoff/glide-linger-current/settings.json';
import {COST_LEAD_IN_DEFAULTS, COST_LEAD_IN_BACKUP, loadCurrentVoiceoverSettings, normalizeCurrentVoiceoverSettings} from './current-cut';
import {normalizeSettings} from './settings';
import {chapterSchedule, sampleCost, sampleUltimate3, ultimate3DurationFrames} from './sample';
import {COST_CLOUD_KEY, costCloudTimelineConfig, settingsFromCostCloudTimeline, costTimelineConfig} from './authoring';
import {voiceoverSchedule} from './voiceover-schedule';
import {VOICEOVER_SETTINGS_ID} from './voiceover-cut';
import * as sound from './sound';

const before = normalizeSettings(profile);
const after = COST_LEAD_IN_DEFAULTS;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('Cost gets exactly 1.5s of covered lead-in; every existing global action and later chapter stays put', () => {
  near(after.allocations.ultimate2, 17.56); near(after.allocations.cost, 10.87);
  near(after.pacing.ultimate2HandoffHold, .15); near(after.pacing.costTrimEnd, 10.87);
  const old = chapterSchedule(before), next = chapterSchedule(after);
  for (let i = 2; i < old.length; i++) {near(old[i].start, next[i].start); near(old[i].end, next[i].end);}
  for (const key of Object.keys(before.cost.timing) as (keyof typeof before.cost.timing)[]) {
    near(old[1].start + before.cost.timing[key].at, next[1].start + after.cost.timing[key].at);
    assert.deepEqual({...after.cost.timing[key], at: 0}, {...before.cost.timing[key], at: 0});
  }
  assert.equal(ultimate3DurationFrames(after), 2212);
  assert.deepEqual(voiceoverSchedule(after), voiceoverSchedule(before));
  // Global sound cue families (round only subtraction noise, never audio samples).
  const rounded = (x: unknown) => JSON.parse(JSON.stringify(x, (_key, v) => typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v));
  for (const [name, fn] of Object.entries(sound)) if (typeof fn === 'function' && name.startsWith('ultimate3'))
    assert.deepEqual(rounded((fn as any)(after)), rounded((fn as any)(before)), name);
  for (const t of [19.06, 20, 22, 25, 28.42, 29, 38, 50, 67]) {
    const a = sampleUltimate3(t, before), b = sampleUltimate3(t, after);
    if (a.cost && b.cost) {assert.deepEqual(rounded(a.cost.camera), rounded(b.cost.camera)); assert.deepEqual(rounded(a.cost.cheapAgents), rounded(b.cost.cheapAgents));}
  }
});

test('guarded migration backs up, preserves custom clips and controls, stamps skips/imports and does not repeat', () => {
  const custom = structuredClone(before); custom.cost.timing.cloudSweep.at += .2; custom.cost.controls.smokeSize = .7;
  const values = new Map([[VOICEOVER_SETTINGS_ID, JSON.stringify(custom)]]);
  const storage = {getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => {values.set(k, v);}};
  const result = loadCurrentVoiceoverSettings(storage);
  assert.equal(storage.getItem(COST_LEAD_IN_BACKUP), JSON.stringify(custom));
  near(result.cost.timing.cloudSweep.at, custom.cost.timing.cloudSweep.at + 1.5);
  assert.equal(result.cost.controls.smokeSize, .7);
  assert.deepEqual(loadCurrentVoiceoverSettings(storage), result);
  for (const literal of [normalizeCurrentVoiceoverSettings(before), {...before, allocations: {...before.allocations, ultimate2: 20}}, {...before, pacing: {...before.pacing, ultimate2HandoffHold: .5}}]) {
    storage.setItem(VOICEOVER_SETTINGS_ID, JSON.stringify(literal));
    const kept = loadCurrentVoiceoverSettings(storage);
    near(kept.allocations.ultimate2, literal.allocations.ultimate2);
    assert.deepEqual(kept.cost.timing, literal.cost.timing);
    assert.equal(kept.costLeadInVersion, 1);
  }
});

test('main cloud alias is the same native Cost clip; early reveal, endpoints, spring, resize and reverse seeking survive JSON', () => {
  const config = costCloudTimelineConfig(after);
  assert.deepEqual(settingsFromCostCloudTimeline(config, after), after, 'opening the Main alias does not author defaults');
  near(config[COST_CLOUD_KEY].at, before.allocations.ultimate2 + before.cost.timing.cloudSweep.at);
  const edited = settingsFromCostCloudTimeline({[COST_CLOUD_KEY]: {...config[COST_CLOUD_KEY], at: 17.7, duration: .8, from: {progress: .2}, to: {progress: .9}, transition: {type: 'spring', stiffness: 140, damping: 18, mass: 1}}}, after);
  const reloaded = normalizeCurrentVoiceoverSettings(JSON.parse(JSON.stringify(edited)));
  assert.deepEqual(reloaded, edited);
  near(costTimelineConfig(edited).cloudSweep.at, .14);
  const sample = (t: number) => sampleUltimate3(t, edited).cost!.cloud.progress;
  const early = sample(18.3); assert.ok(early > .7, `early progress ${early}`);
  sample(25); near(sample(18.3), early); near(sample(17.56), .2);
  const minimal = settingsFromCostCloudTimeline({[COST_CLOUD_KEY]: {...config[COST_CLOUD_KEY], duration: 0}}, after);
  assert.equal(minimal.cost.timing.cloudSweep.duration, .05);
  const physics = settingsFromCostCloudTimeline({[COST_CLOUD_KEY]: {...config[COST_CLOUD_KEY], duration: 2.4}}, after,
    {[`${COST_CLOUD_KEY}.duration`]: .8, [`${COST_CLOUD_KEY}.transition`]: {type: 'spring', stiffness: 140, damping: 18, mass: 1}});
  assert.equal(physics.cost.timing.cloudSweep.duration, .8, 'resolved spring settle duration never replaces raw bar duration');
  assert.deepEqual(physics.cost.timing.cloudSweep.transition, {type: 'spring', stiffness: 140, damping: 18, mass: 1});
});

test('raw Cost preview respects the same native terminal trim as export when its allocation is extended', () => {
  const settings = normalizeSettings({...after, allocations: {...after.allocations, cost: 15},
    cost: {...after.cost, timing: {...after.cost.timing, cloudSweep: {at: 10, duration: 4, from: {progress: .1}, to: {progress: .9}, transition: {type: 'easing', duration: 4, ease: [0, 0, 1, 1]}}}}});
  near(sampleCost(12, settings, .9).cloud.progress, sampleCost(12, settings).cloud.progress);
  near(sampleCost(10, settings, .37).cloud.progress, .37);
});
