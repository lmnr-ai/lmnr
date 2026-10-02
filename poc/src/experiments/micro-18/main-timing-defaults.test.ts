import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import requested from './main-timing-request.fixture.json';
import {COST_LEAD_IN_DEFAULTS, CURRENT_VOICEOVER_DEFAULTS, V11_CURRENT_DEFAULTS, VOICEOVER_TAKE_BACKUP, loadCurrentVoiceoverSettings, migrateUrlCard, migrateVoiceoverTake, normalizeCurrentVoiceoverSettings} from './current-cut';
import {costCloudTimelineConfig, ultimate2CloudTimelineConfig, voiceoverTimelineConfig} from './authoring';
import {COST_ZIP_LEGS, costZipTimelineConfig} from './cost-zip-authoring';
import {chapterSchedule} from './sample';
import {VOICEOVER_SETTINGS_ID} from './voiceover-cut';
import {VOICEOVER_PHRASES} from './voiceover-phrases';
import type {ClipTiming} from './settings';
const near = (a: number, b: number, label: string) => assert.ok(Math.abs(a - b) < 1e-9, `${label}: ${a} != ${b}`);
// The request predates the October 2 take and the laminar.sh card; its narration bars are now that take's slots.
const expected: Record<string, {at: number; duration: number; ease?: number[]}> = {...requested,
  conclusion: {...requested.conclusion, duration: 11.57},
  ...Object.fromEntries(VOICEOVER_PHRASES.map(phrase => [`narration.${phrase.id}`, phrase.placed]))};
const store = (value?: unknown) => {
  const data = new Map(value ? [[VOICEOVER_SETTINGS_ID, JSON.stringify(value)]] : []);
  return {getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => {data.set(key, value);}};
};

test('fresh Main defaults match all 31 supplied clips, easing durations and 0→1 endpoints', () => {
  const settings = loadCurrentVoiceoverSettings(store());
  assert.deepEqual(settings, CURRENT_VOICEOVER_DEFAULTS);
  const chapters = chapterSchedule(settings);
  const clips: Record<string, ClipTiming> = {
    ...Object.fromEntries(chapters.map(chapter => [chapter.id, {at: chapter.start, duration: chapter.duration,
      transition: {type: 'easing', duration: chapter.duration, ease: [0, 0, 1, 1]}, from: {progress: 0}, to: {progress: 1}}])),
    ...ultimate2CloudTimelineConfig(settings), ...costCloudTimelineConfig(settings), ...costZipTimelineConfig(settings),
    ...Object.fromEntries(Object.entries(voiceoverTimelineConfig(settings).narration!).map(([key, clip]) => [`narration.${key}`, clip])),
  };
  assert.deepEqual(Object.keys(clips).sort(), Object.keys(expected).sort());
  for (const [key, target] of Object.entries(expected)) {
    const clip = clips[key];
    near(clip.at, target.at, `${key}.at`);
    near(clip.duration, target.duration, `${key}.duration`);
    assert.equal(clip.transition?.type, 'easing', key);
    if (clip.transition?.type !== 'easing') throw Error(key);
    near(clip.transition.duration, target.duration, `${key}.transition.duration`);
    assert.deepEqual(clip.transition.ease, 'ease' in target ? target.ease : [0, 0, 1, 1], key);
    assert.deepEqual(clip.from, {progress: 0}, key);
    assert.deepEqual(clip.to, {progress: 1}, key);
  }
  assert.equal(Math.ceil(chapters.at(-1)!.end * 30), 2235);
});

test('only cloud exit and the three zip legs change; speech and other animations are untouched', () => {
  const restored = structuredClone(V11_CURRENT_DEFAULTS);
  for (const key of ['cloudSweep', ...COST_ZIP_LEGS] as const) restored.cost.timing[key] = structuredClone(COST_LEAD_IN_DEFAULTS.cost.timing[key]);
  assert.deepEqual(restored, COST_LEAD_IN_DEFAULTS);
});

test('the October 2 take moves only its phrase slots and the comparison clips; the grid return keeps its endpoint', () => {
  const {voiceoverTakeVersion, voiceover, flow: {comparison, ...flow}, conclusion, allocations, ...rest} = CURRENT_VOICEOVER_DEFAULTS;
  const {voiceover: before, flow: {comparison: previous, ...previousFlow}, conclusion: previousConclusion, allocations: previousAllocations, ...previousRest} = V11_CURRENT_DEFAULTS;
  assert.equal(voiceoverTakeVersion, 2);
  assert.deepEqual({...rest, flow}, {...previousRest, flow: previousFlow});
  // The ending only gains the url card: the logo holds 2.99 s, then laminar.sh holds 4.53 s.
  assert.deepEqual({...allocations, conclusion: 0}, {...previousAllocations, conclusion: 0});
  assert.deepEqual(conclusion, {...previousConclusion, logo: {...previousConclusion.logo, duration: 2.99}, url: {at: 7.04, duration: 4.53, transition: undefined}});
  assert.deepEqual(voiceover!.phrases, Object.fromEntries(VOICEOVER_PHRASES.map(phrase => [phrase.id, phrase.placed])));
  assert.notDeepEqual(voiceover, before);
  if (!comparison || !previous) throw Error('comparison');
  for (const [key, clip] of Object.entries(comparison.timing) as [keyof typeof comparison.timing, ClipTiming][]) {
    const old: ClipTiming = previous.timing[key], returning = key === 'comparison_returnToGrid';
    near(clip.at, old.at + (returning ? .25 : .3), key);
    near(clip.at + clip.duration, old.at + old.duration + (returning ? 0 : .3), `${key} end`);
    assert.deepEqual({...clip, at: 0, duration: 0, transition: {...clip.transition, duration: 0}}, {...old, at: 0, duration: 0, transition: {...old.transition, duration: 0}}, key);
  }
  const origin = chapterSchedule(CURRENT_VOICEOVER_DEFAULTS)[2].start + flow.entrySlide.at + flow.entrySlide.duration;
  const {n12, n13} = voiceover!.phrases;
  near(origin + comparison.timing.comparison_gridShrink.at, n13.at, 'grid shrink on n13');
  assert.ok(n13.at >= n12.at + n12.duration);
  const returning = origin + comparison.timing.comparison_returnToGrid.at;
  assert.ok(returning >= n13.at + n13.duration && returning < n13.at + n13.duration + .05, `return ${returning} after n13`);
  near(origin + comparison.timing.comparison_returnToGrid.at + comparison.timing.comparison_returnToGrid.duration,
    origin + flow.timing21!.cameraToEngine.at + flow.timing21!.cameraToEngine.duration, 'engine endpoint');
});

test('stored editable-v11 slots and comparison clips move once; edits and imports stay literal', () => {
  const storage = store(V11_CURRENT_DEFAULTS);
  assert.deepEqual(loadCurrentVoiceoverSettings(storage), CURRENT_VOICEOVER_DEFAULTS);
  assert.equal(storage.getItem(VOICEOVER_TAKE_BACKUP), JSON.stringify(V11_CURRENT_DEFAULTS));
  const edited = structuredClone(V11_CURRENT_DEFAULTS);
  edited.voiceover!.phrases.n05.at = 11;
  if (!edited.flow.comparison) throw Error('comparison');
  edited.flow.comparison.timing.comparison_blueDots.at += .05;
  const kept = loadCurrentVoiceoverSettings(store(edited));
  near(kept.voiceover!.phrases.n05.at, 11, 'n05');
  assert.deepEqual(kept.voiceover!.phrases.n12, CURRENT_VOICEOVER_DEFAULTS.voiceover!.phrases.n12);
  assert.deepEqual(kept.flow.comparison && kept.flow.comparison.timing.comparison_blueDots, edited.flow.comparison.timing.comparison_blueDots);
  assert.deepEqual(kept.flow.comparison && kept.flow.comparison.timing.comparisonExit, CURRENT_VOICEOVER_DEFAULTS.flow.comparison && CURRENT_VOICEOVER_DEFAULTS.flow.comparison.timing.comparisonExit);
  assert.deepEqual(loadCurrentVoiceoverSettings(store(kept)), kept);
  const imported = normalizeCurrentVoiceoverSettings(V11_CURRENT_DEFAULTS);
  assert.deepEqual(loadCurrentVoiceoverSettings(store(imported)).flow, imported.flow);
});

test('new defaults do not overwrite existing saved timings or literal imports', () => {
  assert.deepEqual(loadCurrentVoiceoverSettings(store(COST_LEAD_IN_DEFAULTS)), migrateUrlCard(migrateVoiceoverTake(COST_LEAD_IN_DEFAULTS)));
  const custom = structuredClone(CURRENT_VOICEOVER_DEFAULTS);
  custom.cost.timing.cloudSweep.at = .77;
  custom.cost.timing.cheapLegOneRight.at = 1.23;
  const imported = normalizeCurrentVoiceoverSettings(custom);
  const storage = store(imported);
  assert.deepEqual(loadCurrentVoiceoverSettings(storage), imported);
  assert.deepEqual(loadCurrentVoiceoverSettings(storage), imported);
});

test('Main retains the exact production handoff comment directly above its native hook', () => {
  const source = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes(`// TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Ultimate 3 — Five chapters (fixed order, ripple)'`));
  assert.ok(source.includes('timeline[COST_CLOUD_KEY].current?.progress'));
});
