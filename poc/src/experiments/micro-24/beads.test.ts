import assert from 'node:assert/strict';
import test from 'node:test';
import {beadProgress, BEAD_ORDER, DEFAULT_BEAD_STAGGER_SECONDS} from './beads';
import {createFlow3Sampler, sampleFlow3, liveFlow3, flow3TimelineConfig, type Flow3LiveTimeline} from './sample';
import {FLOW_3_CLIP_KEYS, FLOW_3_TIMELINE} from './timeline';
import {FLOW_3_VIDEO_DEFAULTS} from '../../video/MicroAnimation24';
import {graphState} from './geometry';

test('requested timing defaults, endpoints and curves match, except the intentionally combined bead bar', () => {
  const expected = {
    cloudReveal: [.45, .9], cloudExit: [2.2, 1.51], cameraZoom: [2.11, 1], cameraToBenchmark: [2.13, 1.2],
    dotsExit: [1.95, .9], benchmarkHeading: [3.28, .23], modelPoints: [3.49, .4], ballEntry: [2.77, .75],
    beadsEntry: [2.88, 1.4], intelligenceExit: [5.15, .35], stringExit: [5.15, .5],
    micro23GridShrink: [5.77, .78], micro23OrangeDots: [6.2, .19], micro23BlueDots: [7.18, 1.04], micro23GptLabel: [6.21, .2], micro23FlowLabel: [8.17, .24], micro23GptNumber: [6.2, .21], micro23FlowNumber: [8.17, .24], micro23HeadlineReveal: [6.11, .42], micro23HeadlineFadeOut: [7.28, .19], micro23ReturnToGrid: [8.9, .76],
    cameraToEngine: [10.05, .66], moduleActivation: [10.61, .19], engineSpinner: [10.76, .8], engineLines: [10.76, .8], coverDescent: [11.18, .49], coverTint: [11.52, .45], coverSpinner: [11.57, .41], subtitleIntroducing: [.45, 2.83], subtitleIntelligence: [3.28, 2.49], subtitleCost: [5.77, 4.28], subtitleSignals: [10.05, 5.2],
  };
  assert.deepEqual([...FLOW_3_CLIP_KEYS].sort(), Object.keys(expected).sort());
  for (const key of FLOW_3_CLIP_KEYS) {
    const clip = FLOW_3_TIMELINE[key], [at, duration] = expected[key];
    assert.equal(clip.at, at, key); assert.equal(clip.duration, duration, key);
    assert.deepEqual(clip.from, {progress: 0}); assert.deepEqual(clip.to, {progress: 1});
    assert.deepEqual(clip.transition, {type: 'easing', duration, ease: key.startsWith('subtitle') || key === 'beadsEntry' || key === 'micro23OrangeDots' || key === 'micro23BlueDots' || key === 'micro23HeadlineFadeOut' ? [0, 0, 1, 1] : key === 'micro23GridShrink' ? [.3, 0, .55, 1] : key === 'micro23GptLabel' ? [.2, .62, .55, .96] : key === 'micro23GptNumber' ? [.1, .2, .6, .92] : key === 'micro23FlowNumber' ? [.1, .2, .46, 1] : [.45, 0, .55, 1]});
  }
  assert.equal(FLOW_3_VIDEO_DEFAULTS.beadStaggerSeconds, .11);
});

test('one group starts at Opus, with .11s gaps and all six completed inside the bar', () => {
  assert.equal(DEFAULT_BEAD_STAGGER_SECONDS, .11);
  BEAD_ORDER.forEach((id, index) => {
    const start = 2.88 + index * .11;
    assert.equal(beadProgress(sampleFlow3(start - .01))[id], 0);
    assert.ok(beadProgress(sampleFlow3(start + .01))[id] > 0);
    assert.equal(beadProgress(sampleFlow3(start + .86))[id], 1);
  });
  assert.ok(Object.values(beadProgress(sampleFlow3(4.28))).every(value => value === 1));
  assert.equal(FLOW_3_CLIP_KEYS.filter(key => key.startsWith('bead')).length, 1);
});

test('stagger dial, bar resizing and authored clip.current control all beads deterministically', () => {
  const sampled = sampleFlow3(3.9);
  const together = Object.values(beadProgress(sampled, 0));
  together.forEach(value => assert.equal(value, together[0]));
  assert.notDeepEqual(beadProgress(sampled, 0), beadProgress(sampled, .11));
  const live = {time: sampled.time, duration: 13.3, ...Object.fromEntries(FLOW_3_CLIP_KEYS.map(key => [key,
    {...FLOW_3_TIMELINE[key], current: {progress: sampled.progress[key]}}]))} as Flow3LiveTimeline;
  assert.deepEqual(beadProgress(liveFlow3(live), .17), beadProgress(createFlow3Sampler(flow3TimelineConfig(live)).sample(sampled.time), .17));
  // Not a hidden wall-clock implementation: keep the retained current values,
  // change time, and the group remains in exactly the same authored pose.
  assert.deepEqual(beadProgress({...sampled, time: 999}), beadProgress(sampled));
  const short = createFlow3Sampler({...FLOW_3_TIMELINE, beadsEntry: {...FLOW_3_TIMELINE.beadsEntry, at: 7, duration: .1, transition: {type: 'easing', duration: .1, ease: [0, 0, 1, 1]}}});
  for (const gap of [0, .11, .5, -1, Number.NaN]) {
    assert.ok(Object.values(beadProgress(short.sample(6.9), gap)).every(value => value === 0));
    assert.ok(Object.values(beadProgress(short.sample(7.2), gap)).every(value => value === 1));
  }
  const times = [2.87, 3.02, 3.32, 3.82, 4.28];
  const poses = times.map(time => beadProgress(sampleFlow3(time), .15));
  [...times].reverse().forEach((time, index) => assert.deepEqual(beadProgress(sampleFlow3(time), .15), poses[poses.length - index - 1]));
});
