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
import v7 from '../../../handoff/latest-ultimate3/settings.json';
import v8 from '../../../handoff/voiceover-subtle-a/default-settings.json';
import v9 from '../../../handoff/voiceover-quicker-trace/default-settings.json';
import {ultimate2TimelineConfig, voiceoverTimelineConfig} from './authoring';
import {CADENCE_RUN_TRIM, CADENCE_STREAM_SPEED, CADENCE_TRIM, COST_CADENCE, CLUSTER_BREATH, FLOW_HOLD, GRID_SOAK, migrateStoredVoiceoverOpening, normalizeVoiceoverSettings, OPENING_RIPPLE, OPENING_STREAM_SPEED, readVoiceoverSettings, TRACE_STREAM_SPEED, TRACE_TRIM, VOICEOVER_DEFAULTS, VOICEOVER_SETTINGS_ID} from './voiceover-cut';
import {VOICEOVER_PHRASES, VOICEOVER_PHRASES_V4} from './voiceover-phrases';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
// Storage written before the September 29 takes: the old cut with the old take's vo* clips.
const old = {...normalizeSettings(imported), voiceover: {version: 1 as const, phrases: Object.fromEntries(VOICEOVER_PHRASES_V4.map(p => [p.id, p.placed]))}};
const load = (value: unknown) => readVoiceoverSettings({getItem: key => key === VOICEOVER_SETTINGS_ID ? JSON.stringify(value) : null});

test('the approved A/subtle take sits at its authored slots as linear DialKit bars with immutable source durations', () => {
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

test('Write and its icon add 360px; the shorter run preserves the 391.025604px approach and continuous blue lift', () => {
  const s = VOICEOVER_DEFAULTS, t = s.ultimate2.timing;
  const prior = routeLayout(old.ultimate2.timing.streamRun.duration, old.ultimate2.controls.streamerSpeed);
  const route = routeLayout(t.streamRun.duration, s.ultimate2.controls.streamerSpeed, s.ultimate2.streamBlocksRemoved);
  assert.equal(s.ultimate2.streamBlocksRemoved, 12);
  close(OPENING_STREAM_SPEED, 378.8606414982164);
  // Bash and the separator go (~5.5% faster), then the tighter cadence adds ~5.8% more.
  close(TRACE_STREAM_SPEED, 399.59371960569547);
  close(CADENCE_STREAM_SPEED, 422.7451517960602);
  close(t.streamRun.duration, 6.728 - TRACE_TRIM - CADENCE_RUN_TRIM);
  close(prior.runEnd, 2128.974396);
  close(route.runEnd, 2488.974396);
  close(route.elbowX, 2880);
  close(route.elbowX - route.runEnd, prior.elbowX - prior.runEnd);
  assert.equal(route.straightBlockCount, prior.straightBlockCount + 2);
  const world = (time: number) => worldState(sampleMicro17(time, t), s.ultimate2.controls, 12);
  const blocks = visibleRouteBlocks(world(t.upwardTurn.at), -10000, 10000);
  assert.deepEqual(blocks.filter(b => !b.key.startsWith('tail-')).map(b => b.id),
    ['thinking-blue', 'turn-top', 'read', 'turn-right', 'thinking-red', 'turn-left', 'write', 'bash-icon']);
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

test('tuned main defaults preserve downstream durations and deterministic reverse sampling', () => {
  const s = VOICEOVER_DEFAULTS, schedule = chapterSchedule(s);
  close(schedule[0].duration, 19.66);
  schedule.forEach((chapter, i) => close(chapter.start, [0, 19.66, 29.91, 45.102, 64.41][i]));
  close(s.allocations.cost, old.allocations.cost - COST_CADENCE);
  close(s.pacing.costTrimEnd, s.allocations.cost);
  close(s.allocations.conclusion, old.allocations.conclusion + GRID_SOAK);
  close(s.allocations.flow, old.allocations.flow + FLOW_HOLD);
  // Reverted global-cloud defaults stay historical; the native cloud bar is independently tuned.
  close(old.clouds!.timing.recede.at + OPENING_RIPPLE - TRACE_TRIM - CADENCE_TRIM, 34.628);
  [17.158, 19.708, 34.628].forEach((at, i) => close(s.clouds!.timing[(['slideIn', 'partialRecede', 'recede'] as const)[i]].at, at));
  close(s.ultimate2.timing.upwardTurn.at, 7.728);
  close(s.ultimate2.timing.warningEnter.at, 10.728);
  close(s.ultimate2.timing.cloudEnter.at, 10.29);
  close(s.ultimate2.timing.cloudEnter.duration, 6.17);
  close(s.allocations.issues,21 - FLOW_HOLD + CLUSTER_BREATH);
  close(schedule[4].start,64.41);
  close(schedule.at(-1)!.end, 70.96);
  assert.equal(ultimate3DurationFrames(s), 2129);
  const times = [0, 3.24, 6.82, 7.728, 8.81, 10.728, 11.3, 17.158, 17.48, 18.08,
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
  assert.equal(normalizeVoiceoverSettings(VOICEOVER_DEFAULTS).ultimate2.streamBlocksRemoved, 12);
  assert.equal(readVoiceoverSettings({getItem: () => null}).ultimate2.streamBlocksRemoved, 12);
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

test('editable-v7 storage (the 10-04 take) switches to the A/subtle phrases; its authored phrases stay', () => {
  assert.deepEqual(load(v7), VOICEOVER_DEFAULTS);
  const authored = structuredClone(v7);
  authored.voiceover.phrases.n05.at = 14;
  const reloaded = load(authored);
  // The authored slot stays; the duration is capped to the A/subtle trim.
  assert.deepEqual(reloaded.voiceover!.phrases.n05, {at: 14, duration: VOICEOVER_PHRASES[4].b - VOICEOVER_PHRASES[4].a});
  assert.deepEqual(reloaded.voiceover!.phrases.n06, VOICEOVER_DEFAULTS.voiceover!.phrases.n06);
});

test('editable-v8 storage takes the shorter trace run; tuned speed keeps its route and authored clips stay', () => {
  assert.deepEqual(load(v8), VOICEOVER_DEFAULTS);
  const authored = structuredClone(v8);
  authored.ultimate2.timing.highlight.at = 12;
  authored.voiceover.phrases.n05.at = 13.9;
  const reloaded = load(authored);
  assert.equal(reloaded.ultimate2.timing.highlight.at, 12);
  assert.equal(reloaded.voiceover!.phrases.n05.at, 13.9);
  assert.deepEqual(reloaded.voiceover!.phrases.n06, VOICEOVER_DEFAULTS.voiceover!.phrases.n06);
  // A tuned speed keeps the whole v8 opening and its phrase slots, so its run still reaches the elbow.
  const tuned = structuredClone(v8);
  tuned.ultimate2.controls.streamerSpeed = 390;
  const kept = load(tuned);
  assert.equal(kept.ultimate2.streamBlocksRemoved, 10);
  assert.equal(kept.ultimate2.controls.streamerSpeed, 390);
  assert.deepEqual(kept.ultimate2.timing, normalizeSettings(v8).ultimate2.timing);
  assert.equal(kept.allocations.ultimate2, v8.allocations.ultimate2);
  assert.deepEqual(kept.clouds, normalizeSettings(v8).clouds);
  assert.deepEqual(kept.voiceover, normalizeSettings(v8).voiceover);
  assert.deepEqual(kept.cost, normalizeSettings(v8).cost);
  assert.deepEqual(kept.pacing, normalizeSettings(v8).pacing);
  assert.deepEqual(kept.allocations, normalizeSettings(v8).allocations);
  const t = kept.ultimate2.timing, route = routeLayout(t.streamRun.duration, 390, 10);
  const world = (time: number) => worldState(sampleMicro17(time, t), kept.ultimate2.controls, 10);
  close(world(t.upwardTurn.at).head, route.elbowX);
  // Leftover September 27 vo* phrases, or no voiceover at all, still get the v8 slots.
  for (const voiceover of [old.voiceover, undefined])
    assert.deepEqual(load({...tuned, voiceover}).voiceover, normalizeSettings(v8).voiceover);
});

test('editable-v9 storage takes the tighter cadence; tuned speed keeps the v9 opening and Cost, authored clips stay', () => {
  assert.deepEqual(load(v9), VOICEOVER_DEFAULTS);
  const authored = structuredClone(v9);
  authored.cost.timing.bashWarning.at = 8.5;
  authored.ultimate2.timing.finalZoom.at = 14;
  authored.voiceover.phrases.n08.at = 27;
  const reloaded = load(authored);
  assert.equal(reloaded.cost.timing.bashWarning.at, 8.5);
  assert.equal(reloaded.ultimate2.timing.finalZoom.at, 14);
  assert.equal(reloaded.voiceover!.phrases.n08.at, 27);
  assert.deepEqual(reloaded.cost.timing.bashHighlight, VOICEOVER_DEFAULTS.cost.timing.bashHighlight);
  assert.deepEqual(reloaded.voiceover!.phrases.n09, VOICEOVER_DEFAULTS.voiceover!.phrases.n09);
  const tuned = structuredClone(v9);
  tuned.ultimate2.controls.streamerSpeed = 410;
  const kept = load(tuned), frozen = normalizeSettings(v9);
  assert.equal(kept.ultimate2.streamBlocksRemoved, 12);
  assert.equal(kept.ultimate2.controls.streamerSpeed, 410);
  for (const key of ['allocations', 'pacing', 'clouds', 'cost', 'voiceover'] as const) assert.deepEqual(kept[key], frozen[key], key);
  assert.deepEqual(kept.ultimate2.timing, frozen.ultimate2.timing);
  assert.deepEqual(load({...tuned, voiceover: undefined}).voiceover, frozen.voiceover);
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
    // The A/subtle source caps the old n09 trim; its slot stays.
    assert.deepEqual(reloaded.voiceover!.phrases.n09, saved.voiceover!.phrases.n09);
    assert.equal(reloaded.voiceover!.phrases.n09.at, n09.at);
    assert.deepEqual(reloaded.flow.timing21, saved.flow.timing21);
    assert.deepEqual(reloaded.issues.timing22, saved.issues.timing22);
    assert.deepEqual(reloaded.pacing, saved.pacing);
    assert.deepEqual(reloaded.allocations.flow, saved.allocations.flow);
  }
});
