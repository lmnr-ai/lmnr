import assert from 'node:assert/strict';
import test from 'node:test';
import brisk from '../../../handoff/voiceover-brisk-cadence/default-settings.json';
import quicker from '../../../handoff/voiceover-quicker-trace/default-settings.json';
import {normalizeSettings} from './settings';
import {VOICEOVER_DEFAULTS, readVoiceoverSettings, normalizeVoiceoverSettings} from './voiceover-cut';
import {chapterSchedule, sampleUltimate3, ultimate3DurationFrames} from './sample';
import {comparisonDefaults, withFlowComparison} from './flow-comparison';
import {voiceoverBedUrl, VOICEOVER_BED_URL, VOICEOVER_PHRASES, VOICEOVER_SOURCE_ROOT} from './voiceover-phrases';
import {voiceoverCaptionAt} from './VoiceoverCaptions';

const upstream = normalizeSettings(brisk);
const merged = VOICEOVER_DEFAULTS;
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('merged cut is exactly upstream editable-v11 plus the local comparison, not a v9 timing rollback', () => {
  const {comparison, ...flow} = merged.flow;
  assert.deepEqual({...merged, flow}, upstream);
  assert.ok(comparison);
  assert.equal(comparison.version, 2);
  assert.deepEqual(comparison, comparisonDefaults(normalizeSettings(quicker).flow.timing21!));
  assert.equal(ultimate3DurationFrames(merged), 2085);
  assert.deepEqual(chapterSchedule(merged).map(c => c.start), [0,19.06,28.43,43.622,62.93]);
  assert.equal(VOICEOVER_SOURCE_ROOT, '/audio/voiceover/editable-v11/');
  assert.equal(voiceoverBedUrl('piano'), '/audio/voiceover/editable-v11/bed.wav');
  assert.equal(VOICEOVER_BED_URL, '/audio/voiceover/editable-v11-openai-tactile/bed.wav');
  assert.deepEqual(merged.voiceover!.phrases, Object.fromEntries(VOICEOVER_PHRASES.map(p => [p.id,p.placed])));
});

test('every exported frame retains upstream animation clocks and narration; only comparison sample is added', () => {
  const frames = ultimate3DurationFrames(merged);
  for (let frame = 0; frame < frames; frame++) {
    const time = frame / 30;
    const actual = sampleUltimate3(time, merged);
    const expected = sampleUltimate3(time, upstream);
    if (actual.flow) {
      const {comparison, ...flow} = actual.flow;
      assert.ok(comparison);
      assert.deepEqual({...actual, flow}, expected, `sample at frame ${frame}`);
    } else assert.deepEqual(actual, expected, `sample at frame ${frame}`);
    assert.equal(voiceoverCaptionAt(time, merged.voiceover!), voiceoverCaptionAt(time, upstream.voiceover!));
  }
});

test('pricing reveals on the retimed 20x phrase and arrives at the unchanged native engine endpoint', () => {
  const c = merged.flow.comparison;
  assert.ok(c);
  const origin = chapterSchedule(merged)[2].start + merged.flow.entrySlide.at + merged.flow.entrySlide.duration;
  const start = origin + c.timing.comparison_gridShrink.at;
  const returning = origin + c.timing.comparison_returnToGrid.at;
  const end = returning + c.timing.comparison_returnToGrid.duration;
  close(start, 37.3);
  close(start, merged.voiceover!.phrases.n13.at);
  close(returning, 40.07);
  close(end, 41.33);
  close(end, origin + merged.flow.timing21!.cameraToEngine.at + merged.flow.timing21!.cameraToEngine.duration);
  assert.ok(returning >= merged.voiceover!.phrases.n13.at + merged.voiceover!.phrases.n13.duration);
});

test('v9 saved comparison upgrades cadence without resetting edited pricing clips or paper; imports stay literal', () => {
  const saved = withFlowComparison(normalizeSettings(quicker));
  saved.paperTexture = true;
  assert.ok(saved.flow.comparison);
  saved.flow.comparison.timing.comparison_gptNumber.at += .03;
  saved.flow.comparison.timing.comparison_returnToGrid.duration = 1.1;
  const before = structuredClone(saved);
  const upgraded = readVoiceoverSettings({getItem: () => JSON.stringify(saved)});
  assert.deepEqual(saved, before);
  assert.deepEqual(upgraded.flow.comparison, saved.flow.comparison);
  assert.equal(upgraded.paperTexture, true);
  assert.deepEqual(upgraded.voiceover, merged.voiceover);
  assert.deepEqual(upgraded.ultimate2, merged.ultimate2);
  assert.deepEqual(upgraded.cost, merged.cost);
  assert.deepEqual(upgraded.allocations, merged.allocations);
  assert.deepEqual(readVoiceoverSettings({getItem: () => JSON.stringify(upgraded)}), upgraded);
  assert.deepEqual(normalizeVoiceoverSettings(saved).allocations, saved.allocations);
  assert.equal(normalizeVoiceoverSettings({...saved, flow: {...saved.flow, comparison: false}}).flow.comparison, false);
});
