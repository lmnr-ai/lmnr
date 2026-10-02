import assert from 'node:assert/strict';
import test from 'node:test';
import {THOCK, THOCK_MIX_GAIN, THOCK_SAMPLE_RATE, renderThockKeystroke, thockStroke} from './thock-typing';
import {ULTIMATE_3_DEFAULTS} from './settings';
import {ULTIMATE_3_SOUND_DEFAULT_MIX} from './sound-controls';
import {ultimate3TypingTickEvents} from './typing-audio';

const peak = (data: Float32Array) => data.reduce((value, sample) => Math.max(value, Math.abs(sample)), 0);

test('reference contact, plate/body, desk thump, travel, and release are retained', () => {
  assert.deepEqual(THOCK.tick, [1600, .8, .0012]);
  assert.deepEqual(THOCK.modes, [[410, .02, .9], [630, .014, .55], [1120, .008, .3], [2300, .004, .12]]);
  assert.deepEqual(THOCK.thump, [135, .014, .7]);
  assert.equal(THOCK.travel, .002); assert.equal(THOCK.up, .22);
  assert.equal(THOCK_SAMPLE_RATE, 48000); assert.equal(THOCK_MIX_GAIN, .35);
});

test('strokes are deterministic across reverse seeks, stereo, finite and unnormalized', () => {
  const original = renderThockKeystroke(7);
  renderThockKeystroke(2); renderThockKeystroke(18);
  assert.deepEqual(renderThockKeystroke(7), original);
  assert.notDeepEqual(renderThockKeystroke(8), original);
  assert.notDeepEqual(original.left, original.right, 'keys have subtle keyboard-column pan');
  for (const channel of [original.left, original.right]) {
    assert.ok(channel.every(Number.isFinite));
    assert.equal(channel[0], 0, 'soft onset starts from silence');
    assert.ok(peak(channel) > .005 && peak(channel) < .2, 'fixed mixer headroom, not -1dBFS peak normalization');
    assert.ok(Math.abs(channel.at(-1)!) < .002, 'release fades out before the buffer ends');
  }
});

test('seeded words contain 2–6 letters then a centered, lower and longer spacebar', () => {
  let letters = 0;
  let firstSpace = -1;
  for (let index = 0; index < 60; index++) {
    const stroke = thockStroke(index);
    if (stroke.key < 0) {
      assert.ok(letters >= 2 && letters <= 6); assert.equal(stroke.pan, 0);
      firstSpace = firstSpace < 0 ? index : firstSpace; letters = 0;
    } else { letters++; assert.ok(stroke.key < 30 && Math.abs(stroke.pan) <= .15); }
  }
  const space = renderThockKeystroke(firstSpace);
  assert.deepEqual(space.left, space.right);
  assert.ok(space.left.length >= .24 * THOCK_SAMPLE_RATE);
  assert.ok(renderThockKeystroke(0).left.length < .24 * THOCK_SAMPLE_RATE);
});

test('default typing stem keeps headroom at the current production master with overlapping releases', () => {
  const events = ultimate3TypingTickEvents(ULTIMATE_3_DEFAULTS);
  assert.deepEqual(events.map(event => event.voice), events.map((_, index) => index));
  const start = events[0].time;
  const length = Math.ceil((events.at(-1)!.time - start + .5) * THOCK_SAMPLE_RATE);
  const channels = [new Float32Array(length), new Float32Array(length)];
  for (const event of events) {
    const pcm = renderThockKeystroke(event.voice!);
    const offset = Math.round((event.time - start) * THOCK_SAMPLE_RATE);
    [pcm.left, pcm.right].forEach((data, channel) => {
      for (let i = 0; i < data.length; i++) channels[channel][offset + i] += data[i];
    });
  }
  const mix = ULTIMATE_3_SOUND_DEFAULT_MIX;
  const maximum = Math.max(...channels.map(peak)) * mix.masterVolume * mix.typingVolume;
  assert.ok(maximum > .05 && maximum < .8, `typing-only peak ${maximum}; preserve room for the other agent's music/effects`);
});
