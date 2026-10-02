import assert from 'node:assert/strict';
import test from 'node:test';
import {ULTIMATE_3_DEFAULTS} from '../settings';
import {ultimate3ScoreCues} from './cues';
import {seeded} from './dsp';
import {KEYBOARDS, typing} from './keyboards';
import {designNocturne} from './nocturne/design';
import {SCORE_STYLES} from './render';
import {Mix} from './voices';

test('stacked handoff retains upstream score and keyboard selections', () => {
  assert.ok(SCORE_STYLES.phase);
  assert.ok(SCORE_STYLES.tintinnabuli);
  assert.ok(SCORE_STYLES['arabesque-acoustic-chill']);
  assert.deepEqual(Object.keys(KEYBOARDS).sort(), ['clack', 'laptop', 'membrane', 'spring', 'thock']);
});

test('typing-free playback beds suppress every upstream keyboard model and ambience sends', () => {
  for (const keyboard of Object.values(KEYBOARDS)) {
    const mix = new Mix(48000, () => { throw new Error('muted typing must not advance the score RNG'); }, []);
    mix.keyboard = keyboard;
    mix.typingEnabled = false;
    typing(mix, [{at: 0, duration: .5}], {bus: 'sfx', room: 1, hall: 1, delay: 1}, [.3, .15]);
    assert.deepEqual(mix.counts, {});
    for (const bus of [mix.sfx, mix.room, mix.hall, mix.delay]) {
      assert.ok(bus.l.every(value => value === 0));
      assert.ok(bus.r.every(value => value === 0));
    }
  }
});

test('Nocturne-family default thock uses live event identities; alternate models remain selectable', () => {
  const cues = ultimate3ScoreCues(ULTIMATE_3_DEFAULTS);
  for (const keyboard of [KEYBOARDS.thock, KEYBOARDS.laptop]) {
    const mix = new Mix(0, seeded(123), []);
    mix.keyboard = keyboard;
    designNocturne(mix, cues);
    if (keyboard.id === 'thock') {
      assert.equal(mix.counts.keyClick, cues.issues.typingEvents.length);
      assert.equal(mix.counts.keystroke, undefined);
    } else {
      assert.ok(mix.counts.keystroke > 0);
      assert.equal(mix.counts.keyClick, undefined);
    }
  }
});
