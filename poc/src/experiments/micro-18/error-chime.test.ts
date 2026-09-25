import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {ERROR_CHIME_MASTER_REFERENCE, ERROR_CHIME_PATH, errorChimeFrameEvents, errorChimeMasterGain} from './error-chime';
import {ULTIMATE_3_DEFAULTS, normalizeSettings} from './settings';
import {ultimate3ErrorChimeTimes} from './sound';

test('error chimes follow the two editable warning-triangle entrances', () => {
  assert.deepEqual(ultimate3ErrorChimeTimes(ULTIMATE_3_DEFAULTS), [8.868181818, 22.748181818]);
  const retimed = normalizeSettings({
    ...ULTIMATE_3_DEFAULTS,
    allocations: {...ULTIMATE_3_DEFAULTS.allocations, ultimate2: 20},
    ultimate2: {...ULTIMATE_3_DEFAULTS.ultimate2, timing: {
      ...ULTIMATE_3_DEFAULTS.ultimate2.timing,
      warningEnter: {...ULTIMATE_3_DEFAULTS.ultimate2.timing.warningEnter, at: 7},
    }},
    cost: {...ULTIMATE_3_DEFAULTS.cost, timing: {
      ...ULTIMATE_3_DEFAULTS.cost.timing,
      bashWarning: {...ULTIMATE_3_DEFAULTS.cost.timing.bashWarning, at: 9},
    }},
  });
  assert.deepEqual(ultimate3ErrorChimeTimes(retimed), [7, 29]);
});

test('error chime scheduling skips stale cues after seeks', () => {
  const cues = [8.868181818, 22.748181818];
  assert.deepEqual(errorChimeFrameEvents(8.8, 8.82, cues), [8.868181818]);
  assert.deepEqual(errorChimeFrameEvents(8.9, 23, cues), []);
  assert.deepEqual(errorChimeFrameEvents(23, 8, cues), []);
});

test('error tone percentage is calibrated against the unusually high production master gain', () => {
  assert.equal(errorChimeMasterGain(ERROR_CHIME_MASTER_REFERENCE), 1);
  assert.equal(errorChimeMasterGain(0), 0);
  assert.ok(Math.abs(errorChimeMasterGain(10) - 10 / 6.98) < 1e-12);
});

test('preview uses the exact error-chime soundboard asset', () => {
  assert.equal(ERROR_CHIME_PATH, '/audio/error-chime/error-chime.wav');
  const bytes = readFileSync(new URL('../../../public/audio/error-chime/error-chime.wav', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'f93aa94ba4894d0dae3bb9fd4ff636f39f7ba256d6ed624dcc60c8532e5a1deb');
});
