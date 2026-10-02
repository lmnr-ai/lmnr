import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {sampleMicro16, sampleMicro16Frame} from './sample';
import {DEFAULTS, DEFAULT_TIMING, MICRO_16_TIMELINE, micro16DurationFrames, normalizeControls} from './timeline';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const hold = {at: 20, duration: 0};

test('smoke: fade and shrink can be retimed independently of each other and budget power', () => {
  const time = 12.38;
  const normal = sampleMicro16(time);
  const noFade = sampleMicro16(time, DEFAULTS, {smokeFade: hold});
  const noShrink = sampleMicro16(time, DEFAULTS, {smokeShrink: hold});
  assert.equal(noFade.smokeOpacity, 1);
  near(normal.smokeOpacity, 1 - normal.progress.smokeFade);
  near(normal.smokeScale, 1 - .75 * normal.progress.smokeShrink);
  assert.deepEqual(noFade.smokeBounds, normal.smokeBounds);
  normal.puffs.forEach((puff, i) => assert.deepEqual(puff.bounds, noFade.puffs[i].bounds));
  assert.equal(noShrink.smokeScale, 1);
  assert.equal(noShrink.smokeOpacity, normal.smokeOpacity);
  normal.puffs.forEach((puff, i) => assert.equal(puff.opacity, noShrink.puffs[i].opacity));
  for (const state of [noFade, noShrink]) {
    assert.deepEqual(state.budgetAgent, normal.budgetAgent);
    assert.deepEqual(state.camera, normal.camera);
    assert.equal(state.budgetRemaining, normal.budgetRemaining);
  }
  // Keeping the fade open shows the minimum-size smoke after the agent halts.
  const halted = sampleMicro16(15, DEFAULTS, {smokeFade: hold});
  assert.equal(halted.budgetPower, 0);
  assert.equal(halted.smokeOpacity, 1);
  assert.equal(halted.smokeScale, .25);
  assert.ok(halted.puffs.some(puff => puff.opacity > 0));
  assert.equal(micro16DurationFrames({smokeFade: hold}), 600);
  assert.equal(micro16DurationFrames({smokeShrink: hold}), 600);
});

test('smoke: scale floor applies to body and mature puffs without preventing entrance or fade', () => {
  for (const minimum of [0, .25, .6, 1]) {
    const controls = {...DEFAULTS, smokeSize: 1.5, smokeMinimumScale: minimum};
    const initial = sampleMicro16(0, controls);
    assert.equal(initial.smokeScale, 0);
    assert.equal(initial.smokeOpacity, 0);
    const full = sampleMicro16(11.07, controls);
    near(full.smokeScale, 1.5);
    const final = sampleMicro16(15, controls);
    near(final.smokeScale, minimum * 1.5);
    assert.equal(final.smokeOpacity, 0);
    // Births are .7 clock-seconds apart. All but the newest puff are past
    // their .2s growth window; that newest birth may freeze below full size.
    assert.ok(final.puffs.length > 1);
    final.puffs.slice(1).forEach(puff => assert.ok(puff.bounds.width >= 156 * minimum * 1.5 - 1e-8));
    for (let t = 11.07; t <= 13.68; t += .05) {
      const s = sampleMicro16(t, controls);
      assert.ok(s.smokeScale >= minimum * 1.5 - 1e-8 && s.smokeScale <= 1.5);
      assert.ok(s.smokeOpacity >= 0 && s.smokeOpacity <= 1);
    }
  }
  const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8');
  assert.match(scene, /<DitherPhoto bounds=\{s.smokeBounds\} opacity=\{s.smokeOpacity\}/);
});

test('smoke: instant clips, reversible sampling and frame parity', () => {
  const timing = {smokeFade: {at: 13, duration: 0}, smokeShrink: {at: 12, duration: 0}};
  assert.equal(sampleMicro16(11.99, DEFAULTS, timing).smokeScale, 1);
  assert.equal(sampleMicro16(12, DEFAULTS, timing).smokeScale, .25);
  assert.equal(sampleMicro16(12.99, DEFAULTS, timing).smokeOpacity, 1);
  assert.equal(sampleMicro16(13, DEFAULTS, timing).smokeOpacity, 0);
  const earlier = sampleMicro16(11.99, DEFAULTS, timing);
  for (const frame of [450, 396, 0, 360, 390, 365, 330]) {
    assert.deepEqual(sampleMicro16Frame(frame, DEFAULTS, timing), sampleMicro16(frame / 30, DEFAULTS, timing));
  }
  assert.deepEqual(sampleMicro16(11.99, DEFAULTS, timing), earlier);
});

test('smoke: older saved controls receive the floor, new tracks get defaults, existing edits survive', () => {
  assert.equal(normalizeControls({smokeSize: .8}).smokeMinimumScale, .25);
  assert.equal(normalizeControls({smokeMinimumScale: NaN}).smokeMinimumScale, .25);
  assert.equal(normalizeControls({smokeMinimumScale: -1}).smokeMinimumScale, 0);
  assert.equal(normalizeControls({smokeMinimumScale: 2}).smokeMinimumScale, 1);
  const {clips} = computeStaticTimeline(parseTimelineConfig(MICRO_16_TIMELINE), {'budgetDepletion.at': 12.5});
  assert.equal(clips.find(clip => clip.key === 'budgetDepletion')!.at, 12.5);
  for (const key of ['smokeFade', 'smokeShrink'] as const) {
    const restored = clips.find(clip => clip.key === key)!;
    assert.equal(restored.at, DEFAULT_TIMING[key].at);
    assert.equal(restored.duration, DEFAULT_TIMING[key].duration);
  }
  const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  assert.match(app, /smokeMinimumScale: \[DEFAULTS.smokeMinimumScale, 0, 1, .05\]/);
});
