import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {graphState} from '../introducing-flow-1-2/geometry';
import {beadProgress} from '../introducing-flow-1-2/beads';
import {Ultimate3Scene} from './Scene';
import {chapterSchedule, flowNarrationRevealAt, sampleFlow, sampleUltimate3} from './sample';
import {ULTIMATE_3_DEFAULTS} from './settings';
import {VOICEOVER_DEFAULTS as defaults} from './voiceover-cut';

const s = defaults;
const flowStart = chapterSchedule(s)[2].start;
const playback = (globalTime: number) => sampleFlow(globalTime - flowStart, s).playback21!;
const cue = () => flowNarrationRevealAt(s);
const graph = (time: number) => graphState(playback(time), s.flow.controls.beadStaggerSeconds, cue());

test('five peers enter first; flow-1, 73.0 and its dot stay hidden until n12', () => {
  const at = s.voiceover!.phrases.n12.at;
  for (const time of [40.2, 40.8, 41.4, at - .001, at]) assert.equal(graph(time).ball.opacity, 0);
  const before = graph(at - .001);
  assert.equal(before.string.opacity, 1);
  assert.equal(before.points.length, 5);
  const beads = beadProgress(playback(at - .001), s.flow.controls.beadStaggerSeconds, cue());
  for (const id of ['opus', 'sonnet', 'sol', 'gemini', 'luna'] as const) assert.equal(beads[id], 1);
  assert.equal(graph(at + .1).ball.opacity, 1);
  assert.ok(graph(at + .1).ball.y > graph(at + .5).ball.y);
  assert.equal(graph(at + .85 + 1e-8).ball.y, 270);
  assert.equal(graph(at + .85 + 1e-8).ball.score, '73.0');
});

test('peer stagger has no empty Flow slot and late group edits still put Flow last', () => {
  const base = playback(40.2), gap = s.flow.controls.beadStaggerSeconds!;
  const peers = ['opus', 'sonnet', 'sol', 'gemini', 'luna'] as const;
  peers.forEach((id, index) => {
    const time = flowStart + s.flow.entrySlide.at + s.flow.entrySlide.duration + base.timing.beadsEntry.at + index * gap + .001;
    const beads = beadProgress(playback(time), gap, cue());
    assert.ok(beads[id] > 0);
    peers.slice(index + 1).forEach(later => assert.equal(beads[later], 0));
    assert.equal(beads.flow, 0);
  });
  const late = {...base, time: 10, timing: {...base.timing, beadsEntry: {at: 9, duration: 2}}};
  assert.equal(beadProgress(late, gap, cue()).flow, 0);
  assert.ok(beadProgress({...late, time: 11.1}, gap, cue()).flow > 0);
});

test('scene hides all three flow markers, not the line, before the spoken cue', () => {
  const html = renderToStaticMarkup(createElement(Ultimate3Scene, {sample: sampleUltimate3(41.74, s), settings: s}));
  for (const name of ['flow2-ball', 'flow2-flow-score', 'flow2-flow-label']) {
    assert.match(html, new RegExp(`class="${name}"[^>]*style="[^"]*opacity:0`));
  }
  assert.match(html, /class="flow2-string"[^>]*style="[^"]*opacity:1/);
});

test('voiceover and chapter retiming move the native reveal cue without mutating settings', () => {
  const changed = structuredClone(s);
  changed.voiceover!.phrases.n12.at += 1;
  changed.allocations.cost += .5;
  const snapshot = JSON.stringify(changed);
  assert.ok(Math.abs(flowNarrationRevealAt(changed)! - cue()! - .5) < 1e-8);
  assert.equal(JSON.stringify(changed), snapshot);
  assert.equal(flowNarrationRevealAt(ULTIMATE_3_DEFAULTS), undefined);
});

test('reverse seeks are deterministic and the later chart spread remains identical', () => {
  const times = [40.3, 41.74, 41.9, 42.3, 42.7, 45, 46.5];
  const forward = times.map(graph);
  [...times].reverse().forEach((time, i) => assert.deepEqual(graph(time), forward[forward.length - 1 - i]));
  for (const time of [44.92, 45.5, 46.5]) {
    assert.deepEqual(graph(time), graphState(playback(time), s.flow.controls.beadStaggerSeconds));
  }
});
