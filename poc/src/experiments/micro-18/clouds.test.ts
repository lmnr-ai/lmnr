import assert from 'node:assert/strict';
import test from 'node:test';
import {interpolateCloudRects} from '../micro-09/geometry';
import {sampleClouds} from './clouds';
import {cloudTimelineConfig, settingsFromCloudTimeline, cloudTimelineValues} from './authoring';
import {sampleUltimate3, chapterSchedule} from './sample';
import {normalizeSettings, ULTIMATE_3_DEFAULTS} from './settings';
import {VOICEOVER_DEFAULTS} from './voiceover-cut';

const frame = (time: number, settings = VOICEOVER_DEFAULTS) => sampleUltimate3(time, settings).clouds;
const approx = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('three frame-pinned bars cover hidden traces, cheap agents, Flow and stats descent without chapter reset', () => {
  const settings = VOICEOVER_DEFAULTS;
  const t = settings.clouds!.timing;
  const chapters = chapterSchedule(settings);
  approx(t.slideIn.at, settings.ultimate2.timing.cloudEnter.at);
  approx(t.partialRecede.at, chapters[1].start + settings.cost.timing.cloudSweep.at);
  approx(t.recede.at, chapters[2].start + settings.flow.entrySlide.duration + settings.flow.timing.cloudExit.at);
  assert.equal(frame(t.slideIn.at), null);
  assert.equal(frame(t.slideIn.at + t.slideIn.duration)!.translateY, 0);
  assert.deepEqual(frame(chapters[1].start - 1 / 30), frame(chapters[1].start + 1 / 30));
  assert.deepEqual(frame(chapters[2].start - 1 / 30), frame(chapters[2].start + 1 / 30));
  assert.equal(frame(t.partialRecede.at + t.partialRecede.duration)!.translateY, 450);
  assert.deepEqual(frame(t.recede.at), frame(t.partialRecede.at + t.partialRecede.duration));
  assert.ok(frame(t.recede.at + t.recede.duration / 2));
  assert.equal(frame(t.recede.at + t.recede.duration), null);
  const times = [35, 12, 29.52, 17, 33.5, 0, 35];
  const forward = times.map(time => frame(time));
  [...times].reverse().forEach((time, i) => assert.deepEqual(frame(time), forward[forward.length - 1 - i]));
});

test('legacy imports derive new chapter-aligned defaults; explicit X/Y, clips, endpoints and curves persist', () => {
  const previous = normalizeSettings({version: 2, ultimate2: {...ULTIMATE_3_DEFAULTS.ultimate2, timing: {...ULTIMATE_3_DEFAULTS.ultimate2.timing,
    cloudEnter: {...ULTIMATE_3_DEFAULTS.ultimate2.timing.cloudEnter, at: 11}}}, allocations: {...ULTIMATE_3_DEFAULTS.allocations, cost: 18}});
  approx(previous.clouds!.timing.slideIn.at, 11);
  approx(previous.clouds!.timing.partialRecede.at, chapterSchedule(previous)[1].start + previous.cost.timing.cloudSweep.at);
  approx(previous.clouds!.timing.recede.at, chapterSchedule(previous)[2].start + previous.flow.entrySlide.duration + previous.flow.timing.cloudExit.at);
  const authored = normalizeSettings({...previous, clouds: {controls: {x: .8, y: .3}, timing: {
    slideIn: {at: 2, duration: 0, from: {progress: .1}, to: {progress: .9}},
    partialRecede: {at: 3, duration: 2, transition: {type: 'easing', duration: 2, ease: [.2, 0, .8, 1]}},
    recede: {at: 4, duration: 0},
  }}});
  assert.equal(authored.clouds!.timing.recede.at, 5, 'overlap ripples to the previous endpoint');
  assert.notEqual(sampleUltimate3(4, authored).clouds?.translateY, 450, 'easing uses the authored curve and X/Y');
  approx(sampleUltimate3(4, authored).clouds!.translateY!, 900 * (1 - (.8 + (.3 - .8) * .5)));
  const retimed = normalizeSettings({...authored, clouds: {...authored.clouds!, timing: {...authored.clouds!.timing,
    partialRecede: {...authored.clouds!.timing.partialRecede, duration: 3}}}});
  assert.equal(retimed.clouds!.timing.recede.at, 6);
  assert.equal(sampleUltimate3(1.9999, authored).clouds, null);
  approx(sampleUltimate3(2, authored).clouds!.translateY!, 900 * (1 - .8));
  assert.equal(sampleUltimate3(5, authored).clouds, null);
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(authored))), authored);
  assert.deepEqual(settingsFromCloudTimeline(cloudTimelineConfig(previous), previous), previous,
    'opening the panel does not persist fabricated easing or endpoints');
  const config = cloudTimelineConfig(authored);
  assert.deepEqual(Object.keys(config), ['slideIn', 'partialRecede', 'recede']);
  const live = Object.fromEntries(Object.entries(config).map(([key, value]) => [key, {...value}]));
  assert.deepEqual(settingsFromCloudTimeline(live, authored), authored);
  assert.ok(Object.keys(cloudTimelineValues(authored)).includes('partialRecede.from.progress'));
  const zero = normalizeSettings({...authored, clouds: {...authored.clouds!, controls: {x: 0, y: .4}}});
  assert.equal(zero.clouds!.controls.y, 0);
  assert.equal(sampleUltimate3(2, zero).clouds, null);
});

test('absolute X/Y extents alter geometry at equal ratios without a boundary jump', () => {
  const full = VOICEOVER_DEFAULTS;
  const scaled = normalizeSettings({...full, clouds: {...full.clouds!, controls: {x: .8, y: .4}}});
  const {slideIn, partialRecede, recede} = full.clouds!.timing;
  for (const time of [slideIn.at + slideIn.duration / 2, slideIn.at + slideIn.duration,
    partialRecede.at + partialRecede.duration / 2, recede.at + recede.duration / 2]) {
    assert.notDeepEqual(frame(time, scaled), frame(time, full), `equal Y/X ratios are not the same pose at ${time}`);
  }
  assert.deepEqual(frame(partialRecede.at - .000001, scaled), frame(partialRecede.at, scaled));
  const tiny = normalizeSettings({...full, clouds: {...full.clouds!, controls: {x: .01, y: .005}}});
  assert.notDeepEqual(frame(slideIn.at + slideIn.duration, tiny), frame(slideIn.at + slideIn.duration, full));
});

test('imported Flow cloudYOffset changes preview/export state continuously, not at a chapter seam', () => {
  const base = VOICEOVER_DEFAULTS, offset = 84;
  const tuned = normalizeSettings({...base, flow: {...base.flow, controls: {...base.flow.controls, cloudYOffset: offset}}});
  const t = base.clouds!.timing, chapters = chapterSchedule(base);
  assert.deepEqual(frame(t.partialRecede.at, tuned), frame(t.partialRecede.at, base));
  const middle = t.partialRecede.at + t.partialRecede.duration / 2;
  approx(frame(middle, tuned)!.yOffset! - frame(middle, base)!.yOffset!, (offset - 37) / 2);
  for (const at of [chapters[2].start - .001, chapters[2].start, chapters[2].start + .001]) {
    approx(frame(at, tuned)!.yOffset! - frame(at, base)!.yOffset!, offset - 37);
  }
  assert.deepEqual(frame(chapters[2].start, tuned), frame(chapters[2].start + .000001, tuned));
  assert.notDeepEqual(frame(chapters[2].start, tuned), frame(chapters[2].start, base));
});

test('frame projection is camera independent and complete exit leaves no cloud rect on screen', () => {
  const settings = VOICEOVER_DEFAULTS;
  const t = settings.clouds!.timing;
  const time = t.partialRecede.at + .4;
  const first = frame(time, settings);
  const movedCamera = normalizeSettings({...settings, cost: {...settings.cost, controls: {...settings.cost.controls, travelSpeed: settings.cost.controls.travelSpeed + 100}}});
  assert.deepEqual(frame(time, movedCamera), first);
  const after = frame(t.recede.at + t.recede.duration, settings);
  assert.equal(after, null);
  const offscreen = interpolateCloudRects(1, 37, 900);
  assert.ok(offscreen.every(rect => rect.y >= 720));
});
