import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {FLOW_3_APPEARANCE, IntroducingFlow3Scene} from './Scene';
import {createFlow3Sampler, sampleFlow3} from './sample';
import {FLOW_3_TIMELINE} from './timeline';

test('the intelligence assembly exits left and its fixed title folds down', () => {
  const before = renderToStaticMarkup(createElement(IntroducingFlow3Scene, {playback: sampleFlow3(5.15)}));
  const after = renderToStaticMarkup(createElement(IntroducingFlow3Scene, {playback: sampleFlow3(5.65)}));
  assert.match(before, /data-flow-point="true"/);
  assert.equal((before.match(/data-model=/g) ?? []).length, 5);
  for (const label of ['opus-5', 'sonnet-5', 'gpt-6 sol', 'gemini-3.8 flash', 'gpt-6 luna', 'flow-1']) assert.ok(before.includes(label));
  assert.match(after, /translateX\(-1500px\)/);
  assert.match(after, /translateY\(100%\)/);
});

test('the shared 23 insert is deterministic under forward and reverse native-track sampling', () => {
  const sampler = createFlow3Sampler();
  const forward = [6.3, 7.5, 9.7].map(time => sampler.sample(time));
  assert.equal(forward[0].progress.micro23OrangeDots > 0, true);
  assert.equal(forward[1].progress.micro23BlueDots > 0, true);
  assert.equal(forward[2].progress.micro23ReturnToGrid, 1);
  assert.deepEqual(sampler.sample(7.5), forward[1]);
  assert.equal(FLOW_3_APPEARANCE.coverMotion, 'split');
  assert.equal(FLOW_3_TIMELINE.cameraToEngine.at > FLOW_3_TIMELINE.micro23ReturnToGrid.at + FLOW_3_TIMELINE.micro23ReturnToGrid.duration, true);
});
