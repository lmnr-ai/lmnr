import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeClipState} from 'dialkit/timeline';
import {sampleMicro17, livePlayback, safeTime, type LiveTimeline} from './sample';
import {CLIP_KEYS, DEFAULT_TIMING, normalizeTiming, resolveClips, timelineEnd, micro17DurationFrames, timingWarnings, type Timing} from './timeline';

const timing = normalizeTiming();
for (const t of [0, .6, 9.44, 9.46, 10, 13.4, 15.1, 18.5, 22, 10000]) {
  const state = sampleMicro17(t);
  assert.deepEqual(sampleMicro17(t), state);
  const live = Object.fromEntries(resolveClips(timing).map(clip => [clip.key, {...timing[clip.key as keyof Timing],
    current: (computeClipState(clip, t, t) as {current: {progress: number}}).current}])) as Omit<LiveTimeline, 'time'>;
  assert.deepEqual(livePlayback({...live, time: t} as LiveTimeline), state);
}
const seeks = [1000, 0, 9.5, 13, 1, 18.3, 22, 9.5, 0];
const snapshots = seeks.map(t => sampleMicro17(t));
for (let i = seeks.length - 1; i >= 0; i--) assert.deepEqual(sampleMicro17(seeks[i]), snapshots[i]);
for (const t of [-1, NaN, Infinity, -Infinity]) assert.equal(safeTime(t), 0);
assert.deepEqual(sampleMicro17(-100), sampleMicro17(0));
assert.deepEqual(sampleMicro17(1e12), sampleMicro17(22));
// Retiming + curve edits are shared by export and clip.current authoring, with
// smoke clock measured from LIVE smokeEnter rather than hard-coded defaults.
const retimed = normalizeTiming(Object.fromEntries(CLIP_KEYS.map(key => [key, {...DEFAULT_TIMING[key], at: DEFAULT_TIMING[key].at + 3}])));
retimed.streamRun = {...retimed.streamRun, duration: 4, transition: {type: 'easing', duration: 4, ease: [0, 0, 1, 1]}};
for (const t of [4, 6, 8, 11, 17, 22, 100]) {
  const state = sampleMicro17(t, retimed);
  const live = {time: t, ...Object.fromEntries(resolveClips(retimed).map(clip => [clip.key, {...retimed[clip.key as keyof Timing],
    current: (computeClipState(clip, t, t) as {current: {progress: number}}).current}]))} as LiveTimeline;
  assert.deepEqual(livePlayback(live), state);
  assert.equal(state.streamDuration, 4);
  assert.equal(state.smokeTime, Math.max(0, state.time - retimed.smokeEnter.at));
}
assert.ok(Math.abs(timelineEnd(retimed) - 20.818181818181817) < 1e-12);
assert.equal(micro17DurationFrames(retimed), 625);
const instant = normalizeTiming(Object.fromEntries(CLIP_KEYS.map(key => [key, {at: 2, duration: 0}])));
for (const key of CLIP_KEYS) {
  assert.equal(sampleMicro17(1.99, instant).progress[key], 0);
  assert.equal(sampleMicro17(2, instant).progress[key], 1);
  assert.equal(sampleMicro17(100, instant).progress[key], 1);
}
assert.ok(timingWarnings({...timing, upwardTurn: {...timing.upwardTurn, at: 1}}).length > 0);
assert.ok(!CLIP_KEYS.some(key => /football|finale|signals/i.test(key)));
assert.deepEqual(CLIP_KEYS.filter(key => key.startsWith('subtitle')), [
  'subtitleBuild', 'subtitleTrace', 'subtitleFailure', 'subtitleWhy', 'subtitleInsights', 'subtitleIfOnly',
]);
// Registry and isolation seams (source-named checks, no changes to older shots).
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
assert.match(source('../ExperimentPicker.tsx'), /micro-17.*Animation 17 — Ultimate 2/);
assert.match(source('../../tune/main.tsx'), /experiment === 'micro-17'/);
assert.match(source('../../video/Root.tsx'), /id="MicroAnimation17"[\s\S]*?fps=\{30\}[\s\S]*?width=\{1280\}[\s\S]*?height=\{720\}/);
assert.match(source('../../video/MicroAnimation17.tsx'), /sampleMicro17\(useCurrentFrame\(\) \/ fps, timing\)/);
assert.match(source('../../video/styles-entry.ts'), /micro-17\/styles.css/);
assert.match(source('./App.tsx'), /timings and transitions, then remove useDialTimeline and <DialTimeline \/>\.\n  const timeline = useDialTimeline/);
assert.match(source('./App.tsx'), /loop: false/);
assert.match(source('./App.tsx'), /livePlayback\(timeline\)/);
assert.doesNotMatch(source('./Scene.tsx'), /Micro09Scene|sampleMicro09/);
assert.match(source('./Scene.tsx'), /<Subtitles progress=\{playback\.progress\}/);
assert.match(source('./styles.css'), /\.micro17-subtitle-layer\{[^}]*z-index:7/);
for (const text of ['You build agents.', 'Every time your agent runs, it leaves a trace.', 'When your agent fails,',
  'the trace can tell you why.', 'The insights you need to make your agents efficient, fast, and reliable are hidden across thousands of traces.',
  'If only someone could read them all.']) assert.ok(source('./Subtitles.tsx').includes(text));
assert.ok(Math.abs(DEFAULT_TIMING.streamRun.duration - 2.718181818181819) < 1e-12);
assert.ok(Math.abs(DEFAULT_TIMING.continueStraight.at - 4.618181818181819) < 1e-12);
assert.equal(micro17DurationFrames(), 535);
assert.match(source('./World.tsx'), /block\.lift && block\.reveal\.complete/);
assert.match(source('./Paper.tsx'), /clipPath: `inset\(\$\{120 \* \(1 - progress\)\}px 0 0 0\)`/);
console.log('PASS: static/live/export parity, reverse seeks, retiming and smoke clock, instant clips, finite time, frozen end, registries and scoped seams');
