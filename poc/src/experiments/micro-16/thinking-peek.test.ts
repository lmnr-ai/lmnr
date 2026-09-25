import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {THINKING_PEEK, THINKING_WARNINGS} from './geometry';
import {sampleMicro16, sampleMicro16Frame} from './sample';
import {DEFAULTS, DEFAULT_TIMING, MICRO_16_TIMELINE, micro16DurationFrames} from './timeline';
import {Micro16Scene} from './Scene';

const keys = ['thinkingDrop'] as const;
const near = (a: number, b: number, epsilon = 1e-5) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const bounds = ({x, y, angle}: {x: number; y: number; angle: number}) => {
  const a = angle * Math.PI / 180;
  const width = Math.abs(THINKING_PEEK.warningWidth * Math.cos(a)) + Math.abs(THINKING_PEEK.warningHeight * Math.sin(a));
  const height = Math.abs(THINKING_PEEK.warningWidth * Math.sin(a)) + Math.abs(THINKING_PEEK.warningHeight * Math.cos(a));
  return {left: x - width / 2, top: y - height / 2, right: x + width / 2, bottom: y + height / 2};
};

test('peek: contents start fully inside the center door; all three motions follow the yellow passes', () => {
  const passesEnd = Math.max(...(['cheapLegOneRight', 'cheapLegTwoLeft', 'cheapLegThreeRight'] as const)
    .map(key => DEFAULT_TIMING[key].at + DEFAULT_TIMING[key].duration));
  for (const key of keys) assert.ok(DEFAULT_TIMING[key].at > passesEnd);
  for (const time of [0, 1.6, 2.59, passesEnd, 2.95]) {
    const state = sampleMicro16(time).thinkingPeek;
    assert.equal(state.drop, 0);
    for (const warning of state.warnings) {
      const rect = bounds(warning);
      assert.ok(rect.left >= 340 && rect.right <= 700);
      assert.ok(rect.top >= 301 && rect.bottom <= 421, 'opaque door fully covers initial warning');
      near(warning.angle, 0);
    }
  }
  const middle = sampleMicro16(3.225).thinkingPeek;
  near(middle.drop, 10);
  middle.warnings.forEach((warning, i) => {
    near(warning.y, (361 + THINKING_WARNINGS[i].y) / 2);
    near(warning.angle, -10);
  });
});

test('peek: final geometry, tilt, colors and overlap order match Figma 4779:16756', () => {
  const final = sampleMicro16(3.5).thinkingPeek;
  assert.equal(final.drop, 20);
  // Right → middle → left draw order is the order in the reference.
  const expectedLeft = [527.953125, 455.06640625, 380.69921875];
  const colors = ['#26AE6C', '#F59ED5', '#F78079'];
  final.warnings.forEach((warning, i) => {
    assert.equal(warning.angle, -20);
    const rect = bounds(warning);
    near(rect.left, expectedLeft[i]);
    near(rect.top, 301 - 41 - 81.9405 * Math.sin(20 * Math.PI / 180));
    assert.ok(rect.top < 301 && rect.bottom > 321, 'bottoms stay occluded by the lowered door');
    const svg = readFileSync(new URL(`../../../public/micro-16/${warning.asset}`, import.meta.url), 'utf8');
    assert.ok(svg.includes(`fill="${colors[i]}"`));
    assert.ok(svg.includes('viewBox="0 0 81.9405 76.0943"'));
  });
  assert.deepEqual(sampleMicro16(4.4).thinkingPeek, final);
  assert.equal(micro16DurationFrames(), 510);
});

test('peek: one track keeps all motions synchronized through retiming, steps and rewind', () => {
  const final = sampleMicro16(3.5).thinkingPeek;
  assert.deepEqual(Object.keys(DEFAULT_TIMING).filter(key => key.startsWith('thinking')), ['thinkingDrop']);
  const delayed = {thinkingDrop: {...DEFAULT_TIMING.thinkingDrop, at: 4}};
  assert.deepEqual(sampleMicro16(3.5, DEFAULTS, delayed).thinkingPeek, sampleMicro16(0).thinkingPeek);
  const middle = sampleMicro16(4.275, DEFAULTS, delayed).thinkingPeek;
  near(middle.drop, 10);
  middle.warnings.forEach((warning, i) => {
    near(warning.y, (361 + THINKING_WARNINGS[i].y) / 2);
    near(warning.angle, -10);
  });
  const steps = Object.fromEntries(keys.map(key => [key, {at: 3, duration: 0}]));
  assert.equal(sampleMicro16(2.999, DEFAULTS, steps).thinkingPeek.drop, 0);
  assert.deepEqual(sampleMicro16(3, DEFAULTS, steps).thinkingPeek, final);
  for (const frame of [117, 0, 97, 88, 105, 94, 117]) {
    const time = frame / 30;
    assert.deepEqual(sampleMicro16Frame(frame).thinkingPeek, sampleMicro16(time).thinkingPeek);
  }
  // Even independently authored slide/rotation phases cannot reveal warnings
  // below the panel or outside its horizontal bounds.
  for (const rise of [0, .25, .5, .75, 1]) for (const rotation of [0, .25, .5, .75, 1]) {
    THINKING_WARNINGS.forEach(warning => {
      const rect = bounds({...warning, y: 361 + (warning.y - 361) * rise, angle: -20 * rotation});
      assert.ok(rect.bottom <= 421 && rect.left >= 340 && rect.right <= 700);
    });
  }
});

test('peek: renderer replaces only one Thinking block and paints warnings behind its opaque face', () => {
  const markup = renderToStaticMarkup(createElement(Micro16Scene, {state: sampleMicro16(3.225)}));
  assert.equal((markup.match(/data-thinking-peek="true"/g) ?? []).length, 1);
  assert.equal((markup.match(/data-thinking-warning=/g) ?? []).length, 3);
  const doorIndex = markup.indexOf('data-thinking-door="true"');
  for (const warning of THINKING_WARNINGS) assert.ok(markup.indexOf(`data-thinking-warning="${warning.asset}"`) < doorIndex);
  assert.ok(markup.includes('<rect x="340" y="311" width="360" height="120" fill="#5c5c5c"'));
});

test('peek: saved drop timing drives the combined track and obsolete tracks are ignored', () => {
  const {clips, duration} = computeStaticTimeline(parseTimelineConfig(MICRO_16_TIMELINE), {
    'thinkingDrop.at': 3.1,
    'thinkingWarningsRise.at': 9, 'thinkingWarningsRotate.at': 10,
    'cheapLegThreeRight.at': 2.4, 'cheapLegThreeRight.duration': .45,
    'bashExpand.at': 7, 'bashExpand.duration': .7,
  });
  assert.equal(duration, 17);
  assert.equal(clips.find(c => c.key === 'bashExpand')!.at, 7);
  assert.equal(clips.find(c => c.key === 'cheapLegThreeRight')!.at, 2.4);
  for (const key of keys) {
    const clip = clips.find(c => c.key === key)!;
    assert.equal(clip.at, 3.1); assert.equal(clip.duration, .55);
  }
});
