import assert from 'node:assert/strict';
import test from 'node:test';
import {sampleMicro22} from '../micro-22/sample';
import {MICRO_22_TIMING} from '../micro-22/timeline';
import {normalizeVoiceoverSettings, readVoiceoverSettings, VOICEOVER_DEFAULTS as s} from './voiceover-cut';

function withDuration(duration: number) {
  const result = structuredClone(s);
  const clip = result.issues.timing22!.explanationTyping;
  clip.duration = duration;
  if (clip.transition?.type === 'easing') clip.transition.duration = duration;
  return result;
}

test('current explanation reveals words at twice the old speed without moving its start', () => {
  const fast = s.issues.timing22!, slow = withDuration(2.4).issues.timing22!;
  assert.equal(fast.explanationTyping.duration, 1.2);
  assert.equal(fast.explanationTyping.at, slow.explanationTyping.at);
  for (const elapsed of [0, .1, .3, .5, .7, .9, 1.21]) {
    const a = sampleMicro22(fast.explanationTyping.at + elapsed, {timing: fast});
    const b = sampleMicro22(slow.explanationTyping.at + 2 * elapsed, {timing: slow});
    assert.equal(a.report.explanationWords, b.report.explanationWords);
  }
  assert.equal(MICRO_22_TIMING.explanationTyping.duration, 2.4, 'standalone source stays historical');
});

test('only exact old generated typing clips upgrade on storage load; imports and custom timings stay literal', () => {
  const old = withDuration(2.4);
  const upgraded = readVoiceoverSettings({getItem: () => JSON.stringify(old)});
  assert.deepEqual(upgraded, s);
  assert.equal(old.issues.timing22!.explanationTyping.duration, 2.4);
  assert.equal(normalizeVoiceoverSettings(old).issues.timing22!.explanationTyping.duration, 2.4);
  const custom = withDuration(1.8);
  assert.equal(readVoiceoverSettings({getItem: () => JSON.stringify(custom)}).issues.timing22!.explanationTyping.duration, 1.8);
});
