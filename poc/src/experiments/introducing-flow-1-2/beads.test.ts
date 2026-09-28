import assert from 'node:assert/strict';
import test from 'node:test';
import {beadProgress, BEAD_ORDER, DEFAULT_BEAD_STAGGER_SECONDS} from './beads';
import {createFlow2Sampler, sampleFlow2, liveFlow2, flow2TimelineConfig, type Flow2LiveTimeline} from './sample';
import {FLOW_2_CLIP_KEYS, FLOW_2_TIMELINE} from './timeline';
import {FLOW_2_VIDEO_DEFAULTS} from '../../video/IntroducingFlow2';
import {graphState} from './geometry';

test('requested timing defaults, endpoints and curves match, except the intentionally combined bead bar', () => {
  const expected = {
    cloudReveal: [.45, .9], cloudExit: [2.2, 1.51], cameraZoom: [2.11, 1], cameraToBenchmark: [2.13, 1.2],
    dotsExit: [1.95, .9], benchmarkHeading: [3.28, .23], modelPoints: [3.49, .4], ballEntry: [2.77, .75],
    xAxisEntry: [6.1, .5], yAxisExit: [8.02, .5], xAxisExit: [8.08, .5], beadsEntry: [2.88, 1.4],
    graphSpread: [5.41, 1.54], benchmarkHeadingExit: [6.1, .3], analysisHeading: [6.35, .45], flowLabel: [6.42, .4],
    cameraToEngine: [8.64, .66], stringExit: [8.64, .66], moduleActivation: [9.2, .19],
    engineSpinner: [9.35, .8], engineLines: [9.35, .8], coverDescent: [9.77, .49], coverTint: [10.11, .45],
    coverSpinner: [10.16, .41], subtitleIntroducing: [.45, 2.83], subtitleIntelligence: [3.28, 2.82],
    subtitleCost: [6.1, 2.54], subtitleSignals: [8.64, 4.66],
  };
  assert.deepEqual([...FLOW_2_CLIP_KEYS].sort(), Object.keys(expected).sort());
  for (const key of FLOW_2_CLIP_KEYS) {
    const clip = FLOW_2_TIMELINE[key], [at, duration] = expected[key];
    assert.equal(clip.at, at, key); assert.equal(clip.duration, duration, key);
    assert.deepEqual(clip.from, {progress: 0}); assert.deepEqual(clip.to, {progress: 1});
    assert.deepEqual(clip.transition, {type: 'easing', duration, ease: key.startsWith('subtitle') || key === 'beadsEntry' ? [0, 0, 1, 1] : [.45, 0, .55, 1]});
  }
  assert.equal(FLOW_2_VIDEO_DEFAULTS.beadStaggerSeconds, .11);
});

test('one group starts at Opus, with .11s gaps and all six completed inside the bar', () => {
  assert.equal(DEFAULT_BEAD_STAGGER_SECONDS, .11);
  BEAD_ORDER.forEach((id, index) => {
    const start = 2.88 + index * .11;
    assert.equal(beadProgress(sampleFlow2(start - .01))[id], 0);
    assert.ok(beadProgress(sampleFlow2(start + .01))[id] > 0);
    assert.equal(beadProgress(sampleFlow2(start + .86))[id], 1);
  });
  assert.ok(Object.values(beadProgress(sampleFlow2(4.28))).every(value => value === 1));
  assert.equal(FLOW_2_CLIP_KEYS.filter(key => key.startsWith('bead')).length, 1);
});

test('stagger dial, bar resizing and authored clip.current control all beads deterministically', () => {
  const sampled = sampleFlow2(3.9);
  const together = Object.values(beadProgress(sampled, 0));
  together.forEach(value => assert.equal(value, together[0]));
  assert.notDeepEqual(beadProgress(sampled, 0), beadProgress(sampled, .11));
  assert.notDeepEqual(graphState(sampled, 0), graphState(sampled, .11));
  const live = {time: sampled.time, duration: 13.3, ...Object.fromEntries(FLOW_2_CLIP_KEYS.map(key => [key,
    {...FLOW_2_TIMELINE[key], current: {progress: sampled.progress[key]}}]))} as Flow2LiveTimeline;
  assert.deepEqual(beadProgress(liveFlow2(live), .17), beadProgress(createFlow2Sampler(flow2TimelineConfig(live)).sample(sampled.time), .17));
  // Not a hidden wall-clock implementation: keep the retained current values,
  // change time, and the group remains in exactly the same authored pose.
  assert.deepEqual(beadProgress({...sampled, time: 999}), beadProgress(sampled));
  const short = createFlow2Sampler({...FLOW_2_TIMELINE, beadsEntry: {...FLOW_2_TIMELINE.beadsEntry, at: 7, duration: .1, transition: {type: 'easing', duration: .1, ease: [0, 0, 1, 1]}}});
  for (const gap of [0, .11, .5, -1, Number.NaN]) {
    assert.ok(Object.values(beadProgress(short.sample(6.9), gap)).every(value => value === 0));
    assert.ok(Object.values(beadProgress(short.sample(7.2), gap)).every(value => value === 1));
  }
  const times = [2.87, 3.02, 3.32, 3.82, 4.28];
  const poses = times.map(time => beadProgress(sampleFlow2(time), .15));
  [...times].reverse().forEach((time, index) => assert.deepEqual(beadProgress(sampleFlow2(time), .15), poses[poses.length - index - 1]));
});
