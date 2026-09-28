import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {introducingFlowState} from '../introducing-flow-1/geometry';
import {sampleIntroducingFlow1} from '../introducing-flow-1/sample';
import {Flow1WorldContent} from '../introducing-flow-1/Scene';
import {GRAPH_MODELS} from './metrics';
import {descF1Y, valueX, graphState, flow2WorldState, graphAxesState, AXES, AXIS_TICKS, AXIS_TICK_STEP, GRAPH, BEAD_START_Y} from './geometry';
import {createFlow2Sampler, flow2DurationFrames, sampleFlow2, liveFlow2, flow2TimelineConfig, type Flow2LiveTimeline} from './sample';
import {FLOW_2_CLIP_KEYS, FLOW_2_TIMELINE, FLOW_2_TIMELINE_ID} from './timeline';
import {FLOW_2_APPEARANCE, Flow2Graph, IntroducingFlow2Scene} from './Scene';
import {FLOW_2_VIDEO_DEFAULTS} from '../../video/IntroducingFlow2';

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('metrics freeze the current landing benchmark, not Animation 13’s obsolete figures', () => {
  assert.deepEqual(GRAPH_MODELS.map(model => [model.name, model.descF1, model.tracesPerDollar]), [
    ['flow-1', 73, 756], ['Claude Opus 5', 80.6, 7], ['Claude Sonnet 5', 76.9, 11],
    ['GPT-6 Sol', 71.3, 37], ['GPT-6 Luna', 63.8, 632], ['Gemini 3.8 Flash', 65.3, 14],
  ]);
  close((valueX(632) - GRAPH.valueOriginX) / (valueX(756) - GRAPH.valueOriginX), 632 / 756);
});

test('first graph derives peer Y from F1 and pins flow-1 at the 4.5 grid line', () => {
  const state = graphState(sampleFlow2(5.2));
  assert.equal(state.ball.x, 280);
  assert.equal(GRAPH.peersX, 280);
  assert.equal((state.ball.x - GRAPH.gridOriginX) % GRAPH.pitch, 0);
  for (const point of state.points) {
    assert.equal(point.x, 280);
    assert.equal((point.x - GRAPH.gridOriginX) % GRAPH.pitch, 0);
    assert.equal(point.y, descF1Y(point.descF1));
  }
  assert.equal(state.points.length, GRAPH_MODELS.length - 1);
  assert.equal(state.ball.y, 270);
  assert.equal(state.ball.y / GRAPH.pitch, 4.5);
  const sorted = [...GRAPH_MODELS].sort((a, b) => a.descF1 - b.descF1);
  for (let i = 1; i < sorted.length; i++) assert.ok(descF1Y(sorted[i].descF1) <= descF1Y(sorted[i - 1].descF1));
});

test('ball and every dot travel purely horizontally; end positions use actual traces per dollar', () => {
  const first = graphState(sampleFlow2(5.2));
  for (const time of [6.1, 6.2, 6.4, 6.6, 6.95, 8.3]) {
    const state = graphState(sampleFlow2(time));
    assert.equal(state.ball.y, first.ball.y);
    assert.equal(flow2WorldState(sampleFlow2(time)).camera.y, flow2WorldState(sampleFlow2(5.2)).camera.y);
    state.points.forEach((point, index) => assert.equal(point.y, first.points[index].y));
  }
  const end = graphState(sampleFlow2(8.3));
  assert.equal(end.ball.x, 1150);
  for (const point of end.points) assert.equal(point.x, valueX(point.tracesPerDollar));
  const ballXs = [6.1, 6.3, 6.5, 6.8, 6.95].map(time => graphState(sampleFlow2(time)).ball.x);
  ballXs.forEach((x, index) => {if (index) assert.ok(x > ballXs[index - 1]);});
  assert.ok(graphState(sampleFlow2(3.5)).ball.x < first.ball.x, 'the assembly enters from the left');
});

test('string slides in before the shared bead-entry sequence rises from below', () => {
  const entering = graphState(sampleFlow2(2.8));
  assert.ok(entering.string.x > -90 && entering.string.x < 280);
  assert.equal(entering.ball.y, BEAD_START_Y);
  entering.points.forEach(point => assert.equal(point.y, BEAD_START_Y));
  const first = graphState(sampleFlow2(2.95));
  assert.ok(first.string.x > -90 && first.string.x < 280);
  assert.ok(first.points.find(point => point.id === 'opus')!.y < BEAD_START_Y);
  assert.equal(first.points.find(point => point.id === 'sonnet')!.y, BEAD_START_Y);
  assert.equal(first.ball.y, BEAD_START_Y);
  assert.equal(FLOW_2_TIMELINE.beadsEntry.at, 2.88);
  assert.equal(FLOW_2_TIMELINE.beadsEntry.duration, 1.4);
  const settled = graphState(sampleFlow2(5.2));
  assert.equal(settled.ball.x, settled.string.x);
  settled.points.forEach(point => assert.equal(point.x, settled.string.x));
  assert.deepEqual(settled.flowLabel, {x: 310, y: 254});
  assert.equal(settled.ball.size, 20);
  assert.equal(settled.ball.score, '73.0');
  assert.equal(settled.string.crossbar, 0);
  const spread = graphState(sampleFlow2(8.3));
  assert.deepEqual(spread.flowLabel, {x: 1019, y: 296});
  assert.equal(spread.ball.size, 60);
  assert.equal(spread.string.crossbar, 1);
  // One bar retimes the whole sequence, not six unrelated wall-clock delays.
  const custom = createFlow2Sampler({...FLOW_2_TIMELINE, beadsEntry: {...FLOW_2_TIMELINE.beadsEntry, at: 9}});
  assert.equal(graphState(custom.sample(5.2)).points.find(point => point.id === 'opus')!.y, BEAD_START_Y);
});

test('flow-1 string, dot and label exit right during the engine descent, independently of peers', () => {
  const start = graphState(sampleFlow2(8.64));
  const middle = graphState(sampleFlow2(8.97));
  const end = graphState(sampleFlow2(9.3));
  assert.equal(start.ball.x, 1150);
  assert.ok(middle.ball.x > start.ball.x && middle.ball.x < end.ball.x);
  assert.equal(end.ball.x, 1480);
  assert.equal(end.string.x, end.ball.x);
  assert.ok(end.flowLabel.x > 1280);
  for (const state of [middle, end]) {
    assert.equal(state.ball.y, 270);
    assert.deepEqual(state.points, start.points);
    assert.equal(state.flowLabel.x - state.ball.x, -131);
  }
  assert.equal(FLOW_2_TIMELINE.stringExit.at, FLOW_2_TIMELINE.cameraToEngine.at);
  assert.equal(FLOW_2_TIMELINE.stringExit.duration, FLOW_2_TIMELINE.cameraToEngine.duration);
  assert.deepEqual(graphState(sampleFlow2(8.64)), start);
});

test('axes enter from left/bottom and clear before descent, even after retiming', () => {
  const initial = graphAxesState(sampleFlow2(2.8));
  assert.equal(initial.y.x, -136);
  assert.equal(initial.y.x + AXES.yWidth, 0); assert.equal(initial.y.visible, false);
  assert.equal(initial.x.y, 720); assert.equal(initial.x.visible, false);
  const first = graphAxesState(sampleFlow2(5.2));
  assert.equal(first.y.x, -136); assert.equal(first.y.visible, false);
  assert.equal(first.x.visible, false);
  const entering = graphAxesState(sampleFlow2(6.35));
  assert.ok(entering.y.x > -136 && entering.y.x < -36);
  assert.ok(entering.x.y > 600 && entering.x.y < 720);
  assert.ok(entering.y.visible && entering.x.visible);
  close((entering.y.x + 136) / 100, (720 - entering.x.y) / 120);
  const legacy = createFlow2Sampler({...FLOW_2_TIMELINE, yAxisEntry: {...FLOW_2_TIMELINE.xAxisEntry, at: 3.45}});
  assert.deepEqual(graphAxesState(legacy.sample(5.2)), first);
  const delayed = createFlow2Sampler({...FLOW_2_TIMELINE, xAxisEntry: {...FLOW_2_TIMELINE.xAxisEntry, at: 7}});
  assert.equal(graphAxesState(delayed.sample(6.5)).y.visible, false);
  assert.equal(graphAxesState(delayed.sample(6.5)).x.visible, false);
  const settled = graphAxesState(sampleFlow2(7.5));
  assert.equal(settled.x.y, 600); assert.equal(settled.x.visible, true);
  const exiting = graphAxesState(sampleFlow2(8.3));
  assert.ok(exiting.y.x < -36 && exiting.y.x > -136); assert.ok(exiting.x.y > 600);
  for (const key of ['xAxisExit', 'yAxisExit'] as const) assert.ok(FLOW_2_TIMELINE[key].at + FLOW_2_TIMELINE[key].duration < FLOW_2_TIMELINE.cameraToEngine.at);
  for (const time of [8.6, 8.64, 8.97, 9.3, 13]) {
    const axes = graphAxesState(sampleFlow2(time));
    assert.equal(axes.y.visible, false); assert.equal(axes.x.visible, false);
  }
  const retimed = createFlow2Sampler({...FLOW_2_TIMELINE, cameraToEngine: {...FLOW_2_TIMELINE.cameraToEngine, at: 7}});
  assert.equal(graphAxesState(retimed.sample(7)).y.visible, false);
  assert.equal(graphAxesState(retimed.sample(7)).x.visible, false);
  assert.deepEqual(graphAxesState(sampleFlow2(5.2)), first);
  // Axis panels must not cover data at their settled positions.
  graphState(sampleFlow2(7.5)).points.forEach(point => {
    assert.ok(point.x - 10 > AXES.yLeft + AXES.yWidth);
    assert.ok(point.y + 32 < AXES.xTop);
  });
});

test('round axis scales use 5-percent Y steps and 100-trace X steps without moving flow-1', () => {
  assert.equal(AXIS_TICK_STEP, 120);
  assert.deepEqual(AXIS_TICKS.y.map(tick => tick.label), ['80%', '75%', '70%', '65%', '60%']);
  assert.deepEqual(AXIS_TICKS.x.map(tick => tick.label), ['0', '100', '200', '300', '400', '500', '600', '700', '800']);
  close(valueX(756), 1148.16);
  close(GRAPH.ballEndX - valueX(756), 1.84);
  assert.ok(Math.abs(GRAPH.ballEndX - valueX(756)) <= 15);
  assert.equal(graphState(sampleFlow2(7.5)).ball.x, 1150);
  assert.equal(graphState(sampleFlow2(7.5)).ball.y, 270);
  for (const axis of ['x', 'y'] as const) {
    AXIS_TICKS[axis].forEach((tick, index, ticks) => {
      if (index) assert.equal(tick.position - ticks[index - 1].position, axis === 'x' ? 136 : 120);
      if (axis === 'x') {
        assert.equal(tick.value % 100, 0);
        close(valueX(tick.value), tick.position);
        assert.ok(Math.abs(Number(tick.label) - tick.value) <= .5);
      } else {
        assert.equal(tick.position % GRAPH.pitch, 0);
        close(descF1Y(tick.value), tick.position);
        assert.ok(Math.abs(parseFloat(tick.label) - tick.value) <= .05);
      }
    });
  }
});

test('GPT-6 Sol keeps the same gray as its peers throughout the spread', () => {
  for (const time of [5.2, 6.5, 7.5, 8.3]) {
    const html = renderToStaticMarkup(createElement(Flow2Graph, {playback: sampleFlow2(time)}));
    assert.match(html, /data-model="sol"[^>]*style="[^"]*color:#808080/);
  }
});

test('Luna label crosses to the left during the spread, with other labels unchanged', () => {
  const states = [5.2, 6.5, 8.3].map(time => graphState(sampleFlow2(time)));
  const flips = states.map(state => state.points.find(point => point.id === 'luna')!.labelFlip);
  assert.equal(flips[0], 0);
  assert.ok(flips[1] > 0 && flips[1] < 1);
  assert.equal(flips[2], 1);
  states.forEach(state => state.points.filter(point => point.id !== 'luna').forEach(point => assert.equal(point.labelFlip, 0)));
  const html = renderToStaticMarkup(createElement(Flow2Graph, {playback: sampleFlow2(8.3)}));
  assert.match(html, /left:-30px;transform:translateX\(-100%\)[^"]*">gpt-6 luna/);
});

test('sequel defaults to split doors in preview, scene and export and is labeled Animation 21', () => {
  assert.equal(FLOW_2_APPEARANCE.coverMotion, 'split');
  assert.equal(FLOW_2_VIDEO_DEFAULTS.coverMotion, 'split');
  const props = {playback: sampleFlow2(12)};
  assert.equal(renderToStaticMarkup(createElement(IntroducingFlow2Scene, props)), renderToStaticMarkup(createElement(IntroducingFlow2Scene, {...props, coverMotion: 'split'})));
  assert.match(renderToStaticMarkup(createElement(IntroducingFlow2Scene, props)), /Animation 21/);
});

test('title and engine endpoints retain the original camera and cloud geometry; arbitrary/reverse seeks are pure', () => {
  for (const time of [0, 1.5, 5.2, 9.5, 11.1, 13.3]) {
    const state = flow2WorldState(sampleFlow2(time));
    const original = introducingFlowState(sampleIntroducingFlow1(time));
    assert.deepEqual(state.camera, original.camera);
    assert.equal(state.cloudProgress, original.cloudProgress);
    assert.equal(state.cloudTranslateY, original.cloudTranslateY);
    assert.equal(state.coverAngle, original.coverAngle);
  }
  const times = [0, 1.5, 3.5, 5.2, 6.5, 8.3, 9.5, 13.3];
  const results = times.map(time => graphState(sampleFlow2(time)));
  [...times].reverse().forEach((time, index) => assert.deepEqual(graphState(sampleFlow2(time)), results[results.length - index - 1]));
  assert.equal(flow2DurationFrames(), 399);
});

test('live clip.current and copied custom timing use the same endpoints and curves as export sampling', () => {
  const config = {...FLOW_2_TIMELINE, graphSpread: {
    at: 4, duration: 2, from: {progress: .2}, to: {progress: .8},
    transition: {type: 'easing' as const, duration: 2, ease: [0, 0, 1, 1] as [number, number, number, number]},
  }};
  const sampled = createFlow2Sampler(config).sample(5);
  close(sampled.progress.graphSpread, .5);
  const live = {time: 5, duration: 13.3, ...Object.fromEntries(FLOW_2_CLIP_KEYS.map(key => [key,
    {...config[key], current: {progress: sampled.progress[key]}}]))} as Flow2LiveTimeline;
  assert.deepEqual(liveFlow2(live), sampled);
  assert.deepEqual(createFlow2Sampler(flow2TimelineConfig(live)).sample(5), sampled);
  const minimumDuration = createFlow2Sampler({...FLOW_2_TIMELINE, graphSpread: {
    at: 5, duration: 0, from: {progress: 0}, to: {progress: 1}, transition: {type: 'easing', duration: 0, ease: [0, 0, 1, 1]},
  }});
  // Native DialKit enforces a 50ms bar even for an imported zero duration.
  // Match live authoring rather than inventing different export-only semantics.
  assert.equal(minimumDuration.sample(4.99).progress.graphSpread, 0);
  assert.equal(minimumDuration.sample(5).timing.graphSpread.duration, .05);
  assert.equal(minimumDuration.sample(5).progress.graphSpread, 0);
  assert.equal(minimumDuration.sample(5.05).progress.graphSpread, 1);
  const spring = createFlow2Sampler({...FLOW_2_TIMELINE, graphSpread: {
    at: 5, from: {progress: 0}, to: {progress: 1}, transition: {type: 'spring', stiffness: 120, damping: 18, mass: 1},
  }});
  assert.equal(spring.sample(4.99).progress.graphSpread, 0);
  assert.ok(Number.isFinite(spring.sample(5.2).progress.graphSpread));
  assert.deepEqual(graphState(spring.sample(5.2)), graphState(spring.sample(5.2)));
  close(spring.sample(12).progress.graphSpread, 1);
  assert.equal(FLOW_2_TIMELINE_ID, 'introducing-flow-1-2-timeline-v1');
  assert.ok(!('cameraToAnalysis' in FLOW_2_TIMELINE), 'no dead vertical graph-pan control');
});

test('new scene is lowercase, renders one persistent ball and no old stats bars; original content still defaults to original rows', () => {
  const playback = sampleFlow2(8.3);
  const graphHTML = renderToStaticMarkup(createElement(Flow2Graph, {playback}));
  assert.equal((graphHTML.match(/data-flow-point="true"/g) ?? []).length, 1);
  const html = renderToStaticMarkup(createElement(IntroducingFlow2Scene, {playback}));
  assert.match(html, /flow-1/);
  assert.doesNotMatch(html, /Flow-1|class="flow1-benchmark"|class="flow1-bar"/);
  assert.equal((html.match(/class="flow1-world"/g) ?? []).length, 1);
  assert.equal((html.match(/class="flow1-grid"/g) ?? []).length, 1);
  assert.equal((html.match(/class="micro09-clouds"/g) ?? []).length, 1);
  const original = renderToStaticMarkup(createElement(Flow1WorldContent, {
    state: introducingFlowState(sampleIntroducingFlow1(8.3)), time: 8.3, blueDotScale: 1.2, coverMotion: 'top',
  }));
  assert.match(original, /Flow-1/); assert.match(original, /class="flow1-benchmark"/);
});
