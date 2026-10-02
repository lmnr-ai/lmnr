import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {sampleMicro15, sampleMicro15Live} from './sample';
import {Subtitles, MICRO_15_SUBTITLES} from './Subtitles';
import {MICRO_15_DEFAULTS, MICRO_15_SUBTITLE_KEYS, MICRO_15_TIMING, micro15DurationFrames, normalizeMicro15Timing} from './timeline';

assert.deepEqual(MICRO_15_SUBTITLES.map(([, text]) => text), [
  'It finds issues',
  'and clusters them into high-level patterns',
  'Ready for you or your coding agents.',
]);
assert.deepEqual(MICRO_15_SUBTITLE_KEYS.map(key => MICRO_15_TIMING[key]), [
  {at: 0, duration: .94}, {at: .94, duration: 2.42}, {at: 3.32, duration: 3.68},
]);
const oldTiming = Object.fromEntries(Object.entries(MICRO_15_TIMING).filter(([key]) => !MICRO_15_SUBTITLE_KEYS.includes(key as any))) as any;
const normalized = normalizeMicro15Timing(oldTiming);
for (const key of MICRO_15_SUBTITLE_KEYS) assert.deepEqual(normalized[key], MICRO_15_TIMING[key], 'old persisted timing receives only the missing subtitle default');
assert.deepEqual(normalized.appearance, oldTiming.appearance, 'existing persisted tracks are retained');
assert.equal(micro15DurationFrames(), 210);
assert.equal(micro15DurationFrames(6, {...MICRO_15_TIMING, subtitleReady: {at: 7, duration: 2}}), 270, 'delayed subtitle exports are not truncated');

for (const key of MICRO_15_SUBTITLE_KEYS) {
  const clip = MICRO_15_TIMING[key];
  assert.equal(sampleMicro15(clip.at, MICRO_15_DEFAULTS).subtitles[key], 0);
  assert.ok(Math.abs(sampleMicro15(clip.at + clip.duration / 2, MICRO_15_DEFAULTS).subtitles[key] - .5) < 1e-12);
  assert.equal(sampleMicro15(clip.at + clip.duration, MICRO_15_DEFAULTS).subtitles[key], 1);
}
const instantTiming = {...MICRO_15_TIMING, subtitlePatterns: {at: 2, duration: 0}};
assert.equal(sampleMicro15(1.999, MICRO_15_DEFAULTS, instantTiming).subtitles.subtitlePatterns, 0);
assert.equal(sampleMicro15(2, MICRO_15_DEFAULTS, instantTiming).subtitles.subtitlePatterns, 1);
const before = sampleMicro15(4, MICRO_15_DEFAULTS);
sampleMicro15(6, MICRO_15_DEFAULTS); sampleMicro15(0, MICRO_15_DEFAULTS);
assert.deepEqual(sampleMicro15(4, MICRO_15_DEFAULTS), before, 'reverse seeks are deterministic');

const timeline = Object.fromEntries(MICRO_15_SUBTITLE_KEYS.map(key => [key, {current: {progress: key === 'subtitleReady' ? .42 : 0}}]));
assert.equal(sampleMicro15Live(4, MICRO_15_DEFAULTS, MICRO_15_TIMING, timeline).subtitles.subtitleReady, .42, 'paused clip.current edits drive live subtitles');
const instantLive = sampleMicro15Live(2, MICRO_15_DEFAULTS, instantTiming, {subtitlePatterns: {current: {progress: 0}}});
assert.equal(instantLive.subtitles.subtitlePatterns, 1, 'instant boundaries use deterministic time rather than stale clip.current');

const markup = renderToStaticMarkup(createElement(Subtitles, {progress: sampleMicro15(.47, MICRO_15_DEFAULTS).subtitles}));
for (const [, text] of MICRO_15_SUBTITLES) assert.ok(markup.includes(text));
assert.match(markup, /data-subtitle="subtitleIssues" style="opacity:1"/);
assert.match(markup, /data-subtitle="subtitlePatterns" style="opacity:0"/);
const sceneSource = (await import('node:fs')).readFileSync('src/experiments/micro-15/Scene.tsx', 'utf8');
const css = (await import('node:fs')).readFileSync('src/experiments/micro-15/styles.css', 'utf8');
assert.ok(sceneSource.indexOf('<AgentWindow') < sceneSource.indexOf('<Subtitles'), 'subtitle layer renders after the agent');
assert.match(css, /micro15-agent-overlay[^}]*z-index:1/);
assert.match(css, /micro15-subtitle-layer[^}]*z-index:2/);
assert.match(css, /bottom:32px/);
assert.match(css, /font:400 24px\/normal Micro15AgentMono/);
console.log('Micro15 subtitles: exact copy, defaults, normalization, independent lifetimes, edge opacity, instant/reverse sampling, and live clip.current passed.');
