import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import requested from './main-timing-request.fixture.json';
import {COST_LEAD_IN_DEFAULTS, CURRENT_VOICEOVER_DEFAULTS, loadCurrentVoiceoverSettings, normalizeCurrentVoiceoverSettings} from './current-cut';
import {costCloudTimelineConfig, ultimate2CloudTimelineConfig, voiceoverTimelineConfig} from './authoring';
import {COST_ZIP_LEGS, costZipTimelineConfig} from './cost-zip-authoring';
import {chapterSchedule} from './sample';
import {VOICEOVER_SETTINGS_ID} from './voiceover-cut';
import type {ClipTiming} from './settings';
const near = (a: number, b: number, label: string) => assert.ok(Math.abs(a - b) < 1e-9, `${label}: ${a} != ${b}`);
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
  assert.deepEqual(Object.keys(clips).sort(), Object.keys(requested).sort());
  for (const [key, target] of Object.entries(requested)) {
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
  assert.equal(Math.ceil(chapters.at(-1)!.end * 30), 2212);
});

test('only cloud exit and the three zip legs change; speech and other animations are untouched', () => {
  const restored = structuredClone(CURRENT_VOICEOVER_DEFAULTS);
  for (const key of ['cloudSweep', ...COST_ZIP_LEGS] as const) restored.cost.timing[key] = structuredClone(COST_LEAD_IN_DEFAULTS.cost.timing[key]);
  assert.deepEqual(restored, COST_LEAD_IN_DEFAULTS);
});

test('new defaults do not overwrite existing saved timings or literal imports', () => {
  assert.deepEqual(loadCurrentVoiceoverSettings(store(COST_LEAD_IN_DEFAULTS)), COST_LEAD_IN_DEFAULTS);
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
