import assert from 'node:assert/strict';
import test from 'node:test';
import imported from '../../../handoff/voiceover-retime/retimed-settings.json';
import {routeLayout, visibleRouteBlocks, worldState} from '../micro-17/geometry';
import {sampleMicro17} from '../micro-17/sample';
import {chapterSchedule, sampleUltimate3, ultimate3DurationFrames} from './sample';
import {FLOW_21_TIMING, normalizeSettings} from './settings';
import {MICRO_22_TIMING} from '../micro-22/timeline';
import issues4Placements from '../../../handoff/voiceover-issues4/placements.json';
import v6 from '../../../handoff/voiceover-captions/default-settings.json';
import {ultimate2TimelineConfig, voiceoverTimelineConfig} from './authoring';
import {CLUSTER_BREATH, FLOW_HOLD, GRID_SOAK, migrateStoredVoiceoverOpening, normalizeVoiceoverSettings, OPENING_RIPPLE, OPENING_STREAM_SPEED, readVoiceoverSettings, VOICEOVER_DEFAULTS, VOICEOVER_SETTINGS_ID} from './voiceover-cut';
import {VOICEOVER_PHRASES, VOICEOVER_PHRASES_V4} from './voiceover-phrases';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
// Storage written before the September 29 take: the old cut with the old take's vo* clips.
const old = {...normalizeSettings(imported), voiceover: {version: 1 as const, phrases: Object.fromEntries(VOICEOVER_PHRASES_V4.map(p => [p.id, p.placed]))}};
const load = (value: unknown) => readVoiceoverSettings({getItem: key => key === VOICEOVER_SETTINGS_ID ? JSON.stringify(value) : null});

test('the September 29 take sits at its authored slots as linear DialKit bars with immutable source durations', () => {
  const s = VOICEOVER_DEFAULTS, config = voiceoverTimelineConfig(s).narration!;
  assert.equal(VOICEOVER_PHRASES.length, 23);
  for (const p of VOICEOVER_PHRASES) {
    const clip = s.voiceover!.phrases[p.id];
    assert.deepEqual([clip.at, clip.duration], [p.defaultAt, p.b - p.a]);
    assert.deepEqual(config[p.id], {at: clip.at, duration: clip.duration, from: {progress: 0}, to: {progress: 1},
      transition: {type: 'easing', duration: clip.duration, ease: [0, 0, 1, 1]}});
  }
  for (let i = 0; i < VOICEOVER_PHRASES.length - 1; i++) {
    const a = s.voiceover!.phrases[VOICEOVER_PHRASES[i].id], b = s.voiceover!.phrases[VOICEOVER_PHRASES[i + 1].id];
    assert.ok(b.at >= a.at + a.duration - 1e-8, `overlap after ${VOICEOVER_PHRASES[i].id}`);
  }
  const last = s.voiceover!.phrases.n23;
  assert.ok(last.at + last.duration <= ultimate3DurationFrames(s) / 30);
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
  for (let i = 1; i < 4; i++) close(schedule[i].start, chapterSchedule(old)[i].start + OPENING_RIPPLE + (i === 3 ? FLOW_HOLD : 0));
  close(s.allocations.cost, old.allocations.cost);
  close(s.allocations.conclusion, old.allocations.conclusion + GRID_SOAK);
  close(s.allocations.flow, old.allocations.flow + FLOW_HOLD);
  for (const key of ['slideIn', 'partialRecede', 'recede'] as const)
    close(s.clouds!.timing[key].at, old.clouds!.timing[key].at + OPENING_RIPPLE);
  close(s.clouds!.timing.slideIn.at, s.ultimate2.timing.cloudEnter.at);
  close(s.ultimate2.timing.upwardTurn.at, 9.278);
  close(s.ultimate2.timing.warningEnter.at, 12.878);
  close(s.ultimate2.timing.cloudEnter.at, 19.358);
  close(s.allocations.issues,21 - FLOW_HOLD + CLUSTER_BREATH);
  close(schedule[4].start,70.608);
  close(schedule.at(-1)!.end, 77.158);
  assert.equal(ultimate3DurationFrames(s), 2315);
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
  authored.voiceover!.phrases.n02 = {at: 4.1, duration: .7};
  authored.voiceover!.phrases.n08 = {at: 21.7, duration: 1};
  authored.ultimate2.timing.warningEnter.at = 10.1;
  authored.ultimate2.controls.warningXOffset = 99;
  authored.clouds!.timing.partialRecede.at = 30;
  authored.allocations.cost = 16;
  (authored as any).selection = {active: 'n08'};
  const restored = migrateStoredVoiceoverOpening(authored) as typeof authored;
  assert.equal(restored.voiceover!.phrases.n02.at, 4.1);
  assert.equal(restored.voiceover!.phrases.n02.duration, .7);
  assert.equal(restored.voiceover!.phrases.n08.at, 21.7);
  assert.equal(restored.ultimate2.timing.warningEnter.at, 10.1);
  assert.equal(restored.ultimate2.controls.warningXOffset, 99);
  assert.equal(restored.clouds!.timing.partialRecede.at, 30);
  assert.equal(restored.allocations.cost, 16);
  assert.deepEqual((restored as any).selection, {active: 'n08'});
  // Edits of the September 27 take's vo* clips never move the new take's phrases.
  assert.deepEqual(load({...old, voiceover: {version: 1, phrases: {vo06: {at: 30, duration: 1}}}}).voiceover, VOICEOVER_DEFAULTS.voiceover);
});

test('editable-v6 storage takes the clustering breath and grid soak; its authored fields stay', () => {
  assert.deepEqual(load(v6), VOICEOVER_DEFAULTS);
  const authored = structuredClone(v6);
  authored.issues.timing22.analysisCircleGrow.duration = 1.1;
  authored.voiceover.phrases.n20.at = 63.9;
  const reloaded = load(authored);
  assert.equal(reloaded.issues.timing22!.analysisCircleGrow.duration, 1.1);
  assert.equal(reloaded.voiceover!.phrases.n20.at, 63.9);
  assert.deepEqual(reloaded.voiceover!.phrases.n21, VOICEOVER_DEFAULTS.voiceover!.phrases.n21);
  assert.deepEqual(reloaded.conclusion, VOICEOVER_DEFAULTS.conclusion);
});

test('saved historical cuts reload without any piece of the voice retime', () => {
  const n09 = {at: issues4Placements[8].at, duration: issues4Placements[8].b - issues4Placements[8].a};
  const historical = normalizeVoiceoverSettings({...imported, voiceover: {version: 1, phrases: {...VOICEOVER_DEFAULTS.voiceover!.phrases, n09}}});
  const kept20 = {...historical, flow: {...historical.flow, sourceVersion: 21 as const, timing21: FLOW_21_TIMING},
    issues: {...historical.issues, sourceVersion: 20 as const, timing22: MICRO_22_TIMING}};
  for (const saved of [historical, kept20]) {
    const reloaded = load(saved);
    assert.notDeepEqual(saved.cost.timing, VOICEOVER_DEFAULTS.cost.timing);
    assert.deepEqual(reloaded.cost.timing, saved.cost.timing);
    assert.deepEqual(reloaded.voiceover!.phrases.n09, n09);
    assert.deepEqual(reloaded.flow.timing21, saved.flow.timing21);
    assert.deepEqual(reloaded.issues.timing22, saved.issues.timing22);
    assert.deepEqual(reloaded.pacing, saved.pacing);
    assert.deepEqual(reloaded.allocations.flow, saved.allocations.flow);
  }
});
