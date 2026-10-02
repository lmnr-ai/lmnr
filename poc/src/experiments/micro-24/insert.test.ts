import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {flow3Insert} from './insert';
import {flow3WorldState, graphState} from './geometry';
import {IntroducingFlow3Scene} from './Scene';
import {FLOW_3_TIMELINE, FLOW_3_CLIP_KEYS, MICRO23_TRACKS} from './timeline';
import {createFlow3Sampler, liveFlow3, sampleFlow3, type Flow3LiveTimeline} from './sample';
import {createMicro23Sampler} from '../micro-23/sample';

const phase = (value: number, pitch: number) => ((value % pitch) + pitch) % pitch;
test('insert reuses exact standalone23 samples with translated native timings', () => {
  for (const local of [.07, .5, 1.5, 2.8, 4]) {
    const embedded = flow3Insert(sampleFlow3(5.7 + local)).sample;
    const source = createMicro23Sampler().sample(local);
    const {time: _a, ...a} = embedded, {time: _b, ...b} = source;
    // Floating point addition changes progress in the last decimal only.
    assert.equal(JSON.stringify(a, (_, v) => typeof v === 'number' ? +v.toFixed(8) : v), JSON.stringify(b, (_, v) => typeof v === 'number' ? +v.toFixed(8) : v));
  }
});

test('retiming owns card visibility and dot windows; real current values own poses', () => {
  const config = {...FLOW_3_TIMELINE,
    micro23HeadlineReveal: {...FLOW_3_TIMELINE.micro23HeadlineReveal, at: 9},
    micro23GptNumber: {...FLOW_3_TIMELINE.micro23GptNumber, at: 9},
    micro23BlueDots: {...FLOW_3_TIMELINE.micro23BlueDots, duration: .1, transition: {type: 'easing' as const, duration: .1, ease: [0, 0, 1, 1] as [number, number, number, number]}},
  };
  const sampled = createFlow3Sampler(config).sample(6.5), insert = flow3Insert(sampled);
  assert.equal(insert.sample.headlineContainerVisible, false);
  assert.equal(insert.sample.numberContainersVisible.gpt, false);
  assert.equal(insert.sample.dotDurations.blue, .1);
  const live = {time: sampled.time, duration: 15.25, ...Object.fromEntries(FLOW_3_CLIP_KEYS.map(key => [key, {...config[key], current: {progress: sampled.progress[key]}}]))} as Flow3LiveTimeline;
  assert.deepEqual(flow3Insert(liveFlow3(live)), insert);
  live.micro23GridShrink.current.progress = .25;
  assert.equal(flow3Insert(liveFlow3(live)).sample.cellSize, 50);
});

test('both seams share pitch, phase, color and width; no abrupt half-width cut', () => {
  assert.equal(flow3Insert(sampleFlow3(5.769)).active, false);
  assert.equal(flow3Insert(sampleFlow3(10.05)).active, false);
  for (const time of [5.77, 9.7, 10.05 - 1e-6]) {
    const playback = sampleFlow3(time), insert = flow3Insert(playback), world = flow3WorldState(playback);
    assert.equal(insert.active, true);
    assert.equal(insert.gridStrokeWidth, 1);
    assert.equal(insert.sample.cellSize, 60);
    assert.equal(phase(640, 60), phase(world.camera.x, 60));
    assert.equal(phase(insert.sample.gridY, 60), phase(world.camera.y, 60));
    const html = renderToStaticMarkup(createElement(IntroducingFlow3Scene, {playback}));
    assert.match(html, /stroke="#333333" stroke-width="1"/);
  }
  const dense = flow3Insert(sampleFlow3(8.5));
  assert.equal(dense.gridStrokeWidth, .5);
  assert.equal(dense.sample.cellSize, 20);
  const end = flow3Insert(sampleFlow3(9.7)).sample;
  assert.ok(end.gridY + (570 - 350) * end.worldScale < 0);
  assert.equal(end.dots.every(dot => dot.progress === 1), true);
});

test('original intelligence geometry remains while its assembly exits without fading', () => {
  const before = graphState(sampleFlow3(5.15)), after = graphState(sampleFlow3(5.65));
  assert.deepEqual(before, after); // Only the enclosing transform moves left.
  assert.equal(before.ball.x, 280);
  assert.equal(before.ball.y, 270);
  assert.equal(before.points.length, 5);
  assert.equal(before.points.every(point => point.opacity === 1), true);
  assert.ok(FLOW_3_TIMELINE.stringExit.at + FLOW_3_TIMELINE.stringExit.duration < FLOW_3_TIMELINE.micro23GridShrink.at);
});

test('insert remains deterministic across reverse seeking and custom from/to/curves', () => {
  const config = {...FLOW_3_TIMELINE, micro23GridShrink: {...FLOW_3_TIMELINE.micro23GridShrink, from: {progress: .15}, to: {progress: .85}, transition: {type: 'spring' as const, stiffness: 150, damping: 25}}};
  const sampler = createFlow3Sampler(config);
  const times = [0, 5.8, 6, 8.5, 9.7, 11];
  const frames = times.map(t => flow3Insert(sampler.sample(t)));
  [...times].reverse().forEach((time, i) => assert.deepEqual(flow3Insert(sampler.sample(time)), frames[frames.length - i - 1]));
  assert.equal(Object.keys(MICRO23_TRACKS).length, 10);
});
