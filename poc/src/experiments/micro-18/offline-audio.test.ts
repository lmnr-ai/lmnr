import assert from 'node:assert/strict';
import test from 'node:test';
import {ULTIMATE_3_SOUND_DEFAULT_MIX, flattenUltimate3SoundMix, normalizeUltimate3SoundMix} from './sound-controls';

test('export freezes the requested production defaults', () => {
  const mix = ULTIMATE_3_SOUND_DEFAULT_MIX;
  assert.deepEqual([mix.masterVolume, mix.musicVolume, mix.errorToneVolume, mix.tickVolume, mix.costRatchetVolume, mix.typingVolume], [6.98, 0, .11, 2, 2, 1]);
});
test('export accepts zero, unity, and above-unity values without applying gains twice', () => {
  const mix = normalizeUltimate3SoundMix({...ULTIMATE_3_SOUND_DEFAULT_MIX, musicVolume: 0, cloudVolume: 1, typingVolume: 1.2});
  assert.deepEqual([mix.musicVolume, mix.cloudVolume, mix.typingVolume], [0, 1, 1.2]);
  const flat = flattenUltimate3SoundMix({Shared: {masterVolume: 2}, 'Ultimate 2': {tickVolume: 3}, Cost: {costRatchetVolume: 4}, 'Introducing Flow-1': {flowRevealVolume: 1}, 'Issue clusters 2': {typingVolume: 5}});
  assert.deepEqual([flat.masterVolume, flat.tickVolume, flat.costRatchetVolume, flat.typingVolume], [2, 3, 4, 5]);
});
test('export rejects invalid negative gain', () => {
  assert.throws(() => normalizeUltimate3SoundMix({...ULTIMATE_3_SOUND_DEFAULT_MIX, typingVolume: -1}));
});
