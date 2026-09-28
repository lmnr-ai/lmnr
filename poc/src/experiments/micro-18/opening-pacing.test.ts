import assert from 'node:assert/strict';
import test from 'node:test';
import imported from '../../../handoff/voiceover-retime/retimed-settings.json';
import {routeLayout, visibleRouteBlocks, worldState} from '../micro-17/geometry';
import {sampleMicro17} from '../micro-17/sample';
import {chapterSchedule, sampleUltimate3, ultimate3DurationFrames} from './sample';
import {normalizeSettings} from './settings';
import {ultimate2TimelineConfig, voiceoverTimelineConfig} from './authoring';
import {migrateStoredVoiceoverOpening, normalizeVoiceoverSettings, OPENING_RIPPLE, OPENING_STREAM_SPEED, readVoiceoverSettings, VOICEOVER_DEFAULTS, VOICEOVER_SETTINGS_ID} from './voiceover-cut';
import {VOICEOVER_PHRASES} from './voiceover-phrases';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const old = normalizeSettings({...imported, voiceover: {version: 1, phrases: Object.fromEntries(VOICEOVER_PHRASES.map(p =>
  [p.id, {at: p.defaultAt, duration: p.b - p.a}]))}});
const load = (value: unknown) => readVoiceoverSettings({getItem: key => key === VOICEOVER_SETTINGS_ID ? JSON.stringify(value) : null});

test('opening phrases are actual default linear DialKit bars with immutable source durations and downstream gap', () => {
  const s = VOICEOVER_DEFAULTS;
  const target = [[.69, 1.25], [3.44, 2.7299999999999995], [8.37, 1.2399999999999984],
    [10.51, 1.4100000000000001], [13.5, 6.1800000000000015]];
  const config = voiceoverTimelineConfig(s).narration!;
  for (let i = 0; i < 5; i++) {
    const id = VOICEOVER_PHRASES[i].id, clip = s.voiceover!.phrases[id];
    assert.deepEqual([clip.at, clip.duration], target[i]);
    assert.deepEqual(config[id], {at: clip.at, duration: clip.duration, from: {progress: 0}, to: {progress: 1},
      transition: {type: 'easing', duration: clip.duration, ease: [0, 0, 1, 1]}});
    close(clip.duration, VOICEOVER_PHRASES[i].b - VOICEOVER_PHRASES[i].a);
  }
  for (const p of VOICEOVER_PHRASES.slice(5)) {
    close(s.voiceover!.phrases[p.id].at, p.defaultAt + OPENING_RIPPLE);
    close(s.voiceover!.phrases[p.id].duration, p.b - p.a);
  }
  close(s.voiceover!.phrases.vo06.at - (s.voiceover!.phrases.vo05.at + s.voiceover!.phrases.vo05.duration), .6);
  for (let i = 0; i < VOICEOVER_PHRASES.length - 1; i++) {
    const a = s.voiceover!.phrases[VOICEOVER_PHRASES[i].id], b = s.voiceover!.phrases[VOICEOVER_PHRASES[i + 1].id];
    assert.ok(b.at >= a.at + a.duration - 1e-8, `overlap after vo${i + 1}`);
  }
});

test('four actual blocks add 720px; new run preserves the 391.025604px approach and continuous blue lift', () => {
  const s = VOICEOVER_DEFAULTS, t = s.ultimate2.timing;
  const prior = routeLayout(old.ultimate2.timing.streamRun.duration, old.ultimate2.controls.streamerSpeed);
  const route = routeLayout(t.streamRun.duration, s.ultimate2.controls.streamerSpeed, s.ultimate2.streamBlocksRemoved);
  assert.equal(s.ultimate2.streamBlocksRemoved, 10);
  close(OPENING_STREAM_SPEED, 378.8606414982164);
  close(t.streamRun.duration, 6.728);
  close(prior.runEnd, 2128.974396);
  close(route.runEnd, 2848.974396);
  close(route.elbowX, 3240);
  close(route.elbowX - route.runEnd, prior.elbowX - prior.runEnd);
  assert.equal(route.straightBlockCount, prior.straightBlockCount + 4);
  const world = (time: number) => worldState(sampleMicro17(time, t), s.ultimate2.controls, 10);
  const blocks = visibleRouteBlocks(world(t.upwardTurn.at), -10000, 10000);
  assert.deepEqual(blocks.filter(b => !b.key.startsWith('tail-')).map(b => b.id),
    ['thinking-blue', 'turn-top', 'read', 'turn-right', 'thinking-red', 'turn-left', 'write', 'bash-icon', 'bash', 'separator']);
  const blue = blocks.find(b => b.key === 'tail-later-thinking-blue')!;
  assert.equal(blue.lift, true);
  close(blue.x + blue.w, route.liftCenter - route.elbowX + 180);
  for (const seam of [t.continueStraight.at, t.upwardTurn.at, t.upwardTurn.at + t.upwardTurn.duration]) {
    const a = world(seam - 1e-7), b = world(seam + 1e-7);
    for (const key of ['head', 'agentY', 'cameraFocus'] as const) assert.ok(Math.abs(a[key] - b[key]) < .001, key);
  }
  close(world(t.upwardTurn.at).head, route.elbowX);
  close(world(t.upwardTurn.at + t.upwardTurn.duration).agentY, -720);
  assert.equal((ultimate2TimelineConfig(s) as any).streamRun.duration, t.streamRun.duration);
  assert.equal((ultimate2TimelineConfig(s) as any).upwardTurn.at, t.upwardTurn.at);
});

test('downstream chapters and cloud default beats ripple together; editor sampling equals export sampling in reverse', () => {
  const s = VOICEOVER_DEFAULTS, schedule = chapterSchedule(s);
  close(schedule[0].duration, old.allocations.ultimate2 + OPENING_RIPPLE);
  for (let i = 1; i < schedule.length; i++) close(schedule[i].start, chapterSchedule(old)[i].start + OPENING_RIPPLE);
  for (const id of ['cost', 'flow', 'issues', 'conclusion'] as const) close(s.allocations[id], old.allocations[id]);
  for (const key of ['slideIn', 'partialRecede', 'recede'] as const)
    close(s.clouds!.timing[key].at, old.clouds!.timing[key].at + OPENING_RIPPLE);
  close(s.clouds!.timing.slideIn.at, s.ultimate2.timing.cloudEnter.at);
  close(s.ultimate2.timing.upwardTurn.at, 9.278);
  close(s.ultimate2.timing.warningEnter.at, 12.878);
  close(s.ultimate2.timing.cloudEnter.at, 19.358);
  close(schedule.at(-1)!.end, 69.49133333333333);
  assert.equal(ultimate3DurationFrames(s), 2085);
  const times = [0, 3.44, 8.37, 9.278, 10.51, 12.878, 13.5, 19.358, 19.68, 20.28,
    ...schedule.map(chapter => chapter.start), schedule.at(-1)!.end];
  const forward = times.map(time => sampleUltimate3(time, s));
  for (let i = times.length - 1; i >= 0; i--) assert.deepEqual(sampleUltimate3(times[i], s), forward[i]);
  const before = sampleUltimate3(schedule[1].start - 1e-7, s).ultimate2!;
  close(sampleUltimate3(schedule[1].start, s).cost!.cloud.progress,
    worldState(before, s.ultimate2.controls, s.ultimate2.streamBlocksRemoved).cloudProgress);
});

test('explicit legacy imports retain their original route; fresh and new imports retain the extended route', () => {
  const legacy = normalizeVoiceoverSettings(imported);
  assert.equal(legacy.ultimate2.streamBlocksRemoved, undefined);
  assert.deepEqual(legacy.ultimate2.timing, normalizeSettings(imported).ultimate2.timing);
  assert.equal(legacy.ultimate2.controls.streamerSpeed, imported.ultimate2.controls.streamerSpeed);
  assert.equal(normalizeVoiceoverSettings(VOICEOVER_DEFAULTS).ultimate2.streamBlocksRemoved, 10);
  assert.equal(readVoiceoverSettings({getItem: () => null}).ultimate2.streamBlocksRemoved, 10);
});

test('load-only fieldwise migration recognizes old generated values; authored clips, trims, metadata, allocations and clouds survive', () => {
  const migrated = load(old);
  assert.deepEqual(migrated, VOICEOVER_DEFAULTS);
  assert.deepEqual(migrateStoredVoiceoverOpening(migrated), migrated);
  const authored = structuredClone(old);
  authored.voiceover!.phrases.vo02 = {at: 4.1, duration: .7};
  authored.voiceover!.phrases.vo08.at = 21.7;
  authored.ultimate2.timing.warningEnter.at = 10.1;
  authored.ultimate2.controls.warningXOffset = 99;
  authored.clouds!.timing.partialRecede.at = 30;
  authored.allocations.cost = 16;
  (authored as any).selection = {active: 'vo08'};
  const restored = migrateStoredVoiceoverOpening(authored) as typeof authored;
  assert.equal(restored.voiceover!.phrases.vo02.at, 4.1);
  assert.equal(restored.voiceover!.phrases.vo02.duration, .7);
  assert.equal(restored.voiceover!.phrases.vo08.at, 21.7);
  assert.equal(restored.ultimate2.timing.warningEnter.at, 10.1);
  assert.equal(restored.ultimate2.controls.warningXOffset, 99);
  assert.equal(restored.clouds!.timing.partialRecede.at, 30);
  assert.equal(restored.allocations.cost, 16);
  assert.deepEqual((restored as any).selection, {active: 'vo08'});
  assert.equal(restored.voiceover!.phrases.vo06.at, old.voiceover!.phrases.vo06.at + OPENING_RIPPLE);
  // Explicit imports are normalization-only: they do not undergo the storage migration.
  assert.equal(normalizeVoiceoverSettings(authored).voiceover!.phrases.vo06.at, old.voiceover!.phrases.vo06.at);
});
