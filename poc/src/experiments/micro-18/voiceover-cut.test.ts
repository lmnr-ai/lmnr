import assert from 'node:assert/strict';
import test from 'node:test';
import {DialStore, type DialValue} from 'dialkit';
import {parseTimelineConfig} from 'dialkit/timeline';
import importedSettings from '../../../handoff/voiceover-retime/retimed-settings.json';
import placements from '../../../handoff/voiceover-issues4/placements.json';
import subtlePlacements from '../../../handoff/voiceover-subtle-a/placements.json';
import {installMicro20AuthoringCompatibility} from '../micro-20/authoring';
import {issuesTimelineConfig} from './authoring';
import {chapterSchedule, issueHandoffValidation, sampleUltimate3, ultimate3DurationFrames} from './sample';
import {normalizeSettings, SETTINGS_STORAGE_ID, ULTIMATE_3_DEFAULTS} from './settings';
import {readVoiceoverSettings, VOICEOVER_DEFAULTS, VOICEOVER_SETTINGS_ID, VOICEOVER_SOUNDTRACK_URL, GRID_SOAK} from './voiceover-cut';
import {SCORE_STYLES} from './score/render';
import {ultimate3ScoreCues} from './score/cues';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('opening retime retains imported downstream chapters and deterministic reverse sampling', () => {
  // Cost keeps the imported cut except the clips retimed to the September 29 voice.
  const retimed = ['cheapLegOneRight', 'cheapLegTwoLeft', 'cheapLegThreeRight', 'thinkingDrop', 'subtitleMissIssues', 'cameraDownToBudget',
    'purpleBudgetEntry', 'budgetAppear', 'budgetRun', 'smokeEnter', 'budgetDepletion', 'smokeFade', 'smokeShrink', 'subtitleCost'];
  const cost = JSON.parse(JSON.stringify(VOICEOVER_DEFAULTS.cost));
  assert.deepEqual(cost.controls, importedSettings.cost.controls);
  for (const [key, clip] of Object.entries(importedSettings.cost.timing))
    if (retimed.includes(key)) assert.equal(cost.timing[key].duration, key === 'cameraDownToBudget' ? 1.15 : clip.duration);
    else assert.deepEqual(cost.timing[key], clip, key);
  assert.equal(VOICEOVER_DEFAULTS.allocations.cost, importedSettings.allocations.cost);
  assert.equal(VOICEOVER_DEFAULTS.allocations.ultimate2, 21.16);
  assert.equal(VOICEOVER_DEFAULTS.version, 4);
  const {clouds, voiceover} = VOICEOVER_DEFAULTS;
  assert.ok(clouds!.timing.slideIn.at > 0);
  assert.equal(Object.keys(voiceover!.phrases).length, 23);
  assert.equal(ultimate3DurationFrames(VOICEOVER_DEFAULTS), 2278);
  assert.equal(issueHandoffValidation(VOICEOVER_DEFAULTS), null);
  assert.equal(VOICEOVER_DEFAULTS.conclusion.logo.at, 3.75 + GRID_SOAK);
  const pullbackTransition = VOICEOVER_DEFAULTS.conclusion.placeholder.transition;
  assert.equal(pullbackTransition?.type, 'easing');
  if (pullbackTransition?.type === 'easing') assert.equal(pullbackTransition.duration, 3);
  const conclusionStart = chapterSchedule(VOICEOVER_DEFAULTS).at(-1)!.start;
  assert.equal(sampleUltimate3(conclusionStart + 3.74 + GRID_SOAK, VOICEOVER_DEFAULTS).conclusion, 'placeholder');
  assert.equal(sampleUltimate3(conclusionStart + VOICEOVER_DEFAULTS.conclusion.logo.at + 1e-9, VOICEOVER_DEFAULTS).conclusion, 'logo');
  const duration = chapterSchedule(VOICEOVER_DEFAULTS).at(-1)!.end;
  assert.ok(Math.abs(duration - 75.91) < 1e-9);
  const times = [0, .45, 9.57, 18.698, 32.398, 44.898, 50.368, 53.218, 59.53133333333333, 63.301, duration];
  const forward = times.map(time => sampleUltimate3(time, VOICEOVER_DEFAULTS));
  [...times].reverse().forEach((time, i) => assert.deepEqual(sampleUltimate3(time, VOICEOVER_DEFAULTS), forward[forward.length - i - 1]));
  for (const phrase of placements) {
    assert.ok(phrase.at >= 0 && phrase.b > phrase.a && phrase.a >= 0 && phrase.b <= 76.928);
    assert.ok(phrase.at + phrase.b - phrase.a <= duration);
  }
  // The approved A/subtle take is 70.101333s long.
  for (const phrase of subtlePlacements) assert.ok(phrase.a >= 0 && phrase.b > phrase.a && phrase.b <= 70.101333 && phrase.at + phrase.b - phrase.a <= duration);
});

test('v4 preview has matching score, phrase placement and rendered audio provenance', () => {
  const cues = ultimate3ScoreCues(VOICEOVER_DEFAULTS);
  assert.equal(cues.duration, 2278 / 30);
  assert.ok(cues.issues.prelude.bashEntry.at < cues.issues.prelude.scaleOut);
  assert.ok(cues.issues.prelude.scaleOut < cues.issues.native);
  assert.ok(SCORE_STYLES['arabesque-acoustic-chill']);
  assert.match(VOICEOVER_SETTINGS_ID, /v4$/);
  assert.equal(VOICEOVER_SOUNDTRACK_URL, '/audio/voiceover/ultimate3-voiceover-v4.wav');
  const root = new URL('../../../', import.meta.url);
  const file = (path: string) => readFileSync(new URL(path, root));
  const sha256 = (path: string) => createHash('sha256').update(file(path)).digest('hex');
  const manifest = JSON.parse(file('public/audio/voiceover/ultimate3-voiceover-v4.json').toString());
  assert.equal(manifest.version, 4);
  assert.equal(manifest.frames, 1974);
  assert.equal(manifest.duration, 1974 / 30);
  assert.equal(manifest.score.style, 'arabesque-acoustic-chill');
  assert.equal(manifest.settingsSha256, sha256('handoff/voiceover-retime/retimed-settings.json'));
  assert.equal(manifest.placementsSha256, sha256('handoff/voiceover-retime/placements.json'));
  assert.equal(manifest.sourceRecordingSha256, sha256('public/audio/voiceover/Signals-launch-09-27-03-17.m4a'));
  assert.equal(manifest.outputSha256, sha256('public/audio/voiceover/ultimate3-voiceover-v4.wav'));
  const wav = file('public/audio/voiceover/ultimate3-voiceover-v4.wav');
  assert.equal(wav.readUInt32LE(24), 48000);
  assert.equal(wav.readUInt16LE(22), 2);
  const dataOffset = wav.indexOf('data', 12, 'ascii');
  assert.ok(dataOffset > 0);
  assert.equal(wav.readUInt32LE(dataOffset + 4), 1974 / 30 * 48000 * 6);
});

test('voiceover authoring reads only its own storage, preserves later edits and leaves original defaults untouched', () => {
  const before = JSON.stringify(ULTIMATE_3_DEFAULTS);
  const data = new Map([[SETTINGS_STORAGE_ID, JSON.stringify({doNotTouch: true})]]);
  const storage = {getItem: (key: string) => {assert.equal(key, VOICEOVER_SETTINGS_ID); return data.get(key) ?? null;}};
  assert.deepEqual(readVoiceoverSettings(storage), VOICEOVER_DEFAULTS);
  const edited = normalizeSettings({...VOICEOVER_DEFAULTS, conclusion: {...VOICEOVER_DEFAULTS.conclusion, logo: {...VOICEOVER_DEFAULTS.conclusion.logo, duration: 4}}});
  data.set(VOICEOVER_SETTINGS_ID, JSON.stringify(edited));
  assert.deepEqual(readVoiceoverSettings(storage), edited);
  data.set(VOICEOVER_SETTINGS_ID, 'invalid JSON');
  assert.deepEqual(readVoiceoverSettings(storage), VOICEOVER_DEFAULTS);
  assert.equal(data.get(SETTINGS_STORAGE_ID), JSON.stringify({doNotTouch: true}));
  assert.equal(JSON.stringify(ULTIMATE_3_DEFAULTS), before);
});

test('the explicitly owned voiceover Issues panel retains easing through DialKit updates and preset selection', () => {
  const id = 'ultimate3-voiceover-issues-v4';
  const store = new (DialStore.constructor as new () => typeof DialStore)();
  installMicro20AuthoringCompatibility(store, undefined, true, id);
  const config = parseTimelineConfig(issuesTimelineConfig({...VOICEOVER_DEFAULTS, issues: {...VOICEOVER_DEFAULTS.issues, sourceVersion: 20}})).dialConfig;
  store.registerPanel(id, 'Returned cut', config);
  const path = 'postlude_subtitleIssues.transition';
  const easing: DialValue = {type: 'easing', duration: .33, ease: [.1, 0, .8, 1]};
  store.updateValue(id, path, easing);
  store.updateTransitionMode(id, path, 'easing');
  const preset = store.savePreset(id, 'Voiceover custom');
  store.updatePanel(id, 'Returned cut', config);
  assert.deepEqual(store.getValue(id, path), easing);
  store.loadPreset(id, preset);
  assert.deepEqual(store.getValue(id, path), easing);
  assert.equal(store.getValue(id, `${path}.__mode`), 'easing');
  installMicro20AuthoringCompatibility(store, undefined, true, id);
});
