import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {flow2WorldState} from '../introducing-flow-1-2/geometry';
import {Micro22Scene} from '../micro-22/Scene';
import {Micro20Scene} from '../micro-20/Scene';
import {sampleMicro22} from '../micro-22/sample';
import {Ultimate3Scene} from './Scene';
import {chapterSchedule, sampleFlow, sampleUltimate3} from './sample';
import {issueEntryEnd} from './settings';
import {VOICEOVER_DEFAULTS as s} from './voiceover-cut';
import {flowCameraInSharedWorld, flowIssuesCamera, issueSurfacePlacement, projectWorldPoint} from './transitions';

const markup = (time: number) => renderToStaticMarkup(createElement(Ultimate3Scene, {settings: s, sample: sampleUltimate3(time, s)}));

test('source22 shared entry is transparent and unclipped through every nested viewport', () => {
  const start = chapterSchedule(s)[3].start;
  for (const fraction of [.1, .4, .7, .99]) {
    const html = markup(start + issueEntryEnd(s) * fraction);
    for (const cls of ['micro22-composition', 'micro20-composition', 'micro20-world']) {
      const tag = html.match(new RegExp(`<[^>]+class="${cls}"[^>]*>`))![0];
      assert.ok(tag.includes('overflow:visible'), `${cls} clips the incoming world`);
      if (cls !== 'micro20-world') assert.ok(tag.includes('background:transparent'), `${cls} masks the shared grid`);
    }
    assert.ok(!/<g[^>]+clip-path="[^\"]*hero-cell/.test(html), 'macro cell must not crop entry continuations');
    assert.ok(html.includes('class="micro18-shared-grid"'));
  }
});

test('rendered entry trace continuations cover both viewport edges throughout the camera zoom', () => {
  const start = chapterSchedule(s)[3].start;
  const flow = sampleFlow(s.allocations.flow, s);
  const outgoing = flowCameraInSharedWorld(flow2WorldState(flow.playback21!).camera, flow.worldLayout, flow.playback21);
  const placement = issueSurfacePlacement(outgoing);
  for (const fraction of [0, .2, .4, .6, .8, .999]) {
    const time = start + issueEntryEnd(s) * fraction, sample = sampleUltimate3(time, s);
    const html = markup(time);
    const offsets = [0, ...Array.from(html.matchAll(/data-trace-extension="[^"]+" transform="translate\((-?\d+) 0\)"/g), match => Number(match[1]))];
    const {origin, contentScreenScale, bashAgent} = sample.issues!.source22!.world;
    assert.ok(origin && contentScreenScale !== undefined && bashAgent, 'entry must render the trace world');
    const camera = flowIssuesCamera(outgoing, sample.issues!.entryProgress);
    const screenX = (x: number) => projectWorldPoint({
      x: placement.x + placement.scale * (origin.x + contentScreenScale * (x - bashAgent.x)),
      y: placement.y,
    }, camera).x;
    assert.ok(screenX(Math.min(...offsets) - 20) <= 0, `left trace edge at ${fraction}`);
    assert.ok(screenX(Math.max(...offsets) + 1300) >= 1280, `right trace edge at ${fraction}`);
  }
});

test('arrival restores native clipping; standalone and historical source20 stay unchanged', () => {
  const source = sampleMicro22(0);
  const standalone = renderToStaticMarkup(createElement(Micro22Scene, {sample: source}));
  const historical = renderToStaticMarkup(createElement(Micro20Scene, {sample: source.world, sharedEntry: true}));
  const arrival = markup(chapterSchedule(s)[3].start + issueEntryEnd(s) + 1e-6);
  for (const html of [standalone, historical, arrival]) {
    assert.ok(!html.includes('data-trace-extension'));
    assert.ok(/clip-path="[^\"]*hero-cell/.test(html));
  }
});
