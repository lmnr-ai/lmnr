import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {NARRATION} from './narration';
import {sampleMicro20} from './sample';
import {MICRO_20_ISSUE_TIMING, PRELUDE_TIMING} from './timeline';

test('exact requested narration follows detection, scan, clusters and the coding-agent handoff', () => {
  assert.deepEqual(Object.values(NARRATION), [
    'our agent built to analyze traces', 'at scale',
    'It finds deep issues,', 'In every trace,', 'and clusters them into high-level patterns,',
    'Ready for you or your coding agent.',
  ]);
  for (const [time, caption] of [[0, 'flow'], [3.44, 'flow'], [3.45, 'scale'], [4.5, 'scale'], [5.44, 'scale'],
    [5.45, 'detection'], [7.24, 'detection'], [7.25, 'everyTrace'], [8.44, 'everyTrace'], [8.45, 'everyTrace'], [9.38, 'everyTrace'],
    [9.39, 'patterns'], [11.76, 'patterns'], [11.77, 'ready'], [15.44, 'ready'], [15.5, null]] as const) {
    assert.equal(sampleMicro20(time).narration, caption, String(time));
  }
});
test('caption timing follows prelude edits and the effective issue ripple, with deterministic reverse seeks', () => {
  const delayed = {...PRELUDE_TIMING, bashDescent: {...PRELUDE_TIMING.bashDescent, at: 5}};
  const probe = sampleMicro20(10, undefined, delayed);
  const zoomStart = 5 + PRELUDE_TIMING.bashDescent.duration;
  assert.equal(sampleMicro20(zoomStart + 1, undefined, delayed).narration, 'scale');
  assert.equal(sampleMicro20(zoomStart + 2.1, undefined, delayed).narration, 'detection');
  assert.equal(sampleMicro20(probe.issueStart + 1, undefined, delayed).narration, 'patterns');
  const issues = {...MICRO_20_ISSUE_TIMING, subtitleReady: {...MICRO_20_ISSUE_TIMING.subtitleReady, at: 5}};
  assert.equal(sampleMicro20(12, undefined, undefined, undefined, issues).narration, null);
  assert.equal(sampleMicro20(13.6, undefined, undefined, undefined, issues).narration, 'ready');
  const times = [0, 3, 5, 9.5, 12, 15.44];
  const captions = times.map(t => sampleMicro20(t).narration);
  for (let i = times.length - 1; i >= 0; i--) assert.equal(sampleMicro20(times[i]).narration, captions[i]);
});
test('caption fades retain authored endpoints and every-trace copy does not blink at handoff', () => {
  const muted = {...PRELUDE_TIMING, subtitleFlow: {...PRELUDE_TIMING.subtitleFlow, to: {progress: 0}}};
  assert.equal(sampleMicro20(1, undefined, muted).subtitleOpacity, 0);
  assert.ok(sampleMicro20(1).subtitleOpacity > 0);
  assert.equal(sampleMicro20(8.449999).subtitleOpacity, 1);
  assert.equal(sampleMicro20(8.45).subtitleOpacity, 1);
});

test('owned subtitles render outside the SVG camera and hide source15 copy only inside Micro20', () => {
  const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  assert.match(scene, /<\/svg>\s*\{showSubtitles && !sharedEntry && <Subtitles narration=\{s.narration\}/);
  assert.equal((scene.match(/<Subtitles narration=/g) ?? []).length, 2);
  assert.match(css, /\.micro20-issues \.micro15-subtitle-layer \{display:none\}/);
});
