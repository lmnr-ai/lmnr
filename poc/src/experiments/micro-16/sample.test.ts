import assert from 'node:assert/strict';
import {test} from 'node:test';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {interpolateCloudRects} from '../micro-09/geometry';
import {ASSETS, BASH, BLOCKS, BUDGET, BUDGET_TRACE_Y, CHEAP_SPINNER_PATH, GRID, markerCenter, TRACES} from './geometry';
import {HIGHLIGHT_LINES, PAPER_LINES, PAPER_LINE_HEIGHT} from './paper';
import {integratedBudgetClock, sampleMicro16, sampleMicro16Frame} from './sample';
import {CLIP_KEYS, DEFAULT_TIMING, DEFAULTS, MICRO_16_DURATION, MICRO_16_TIMELINE, MICRO_16_TIMELINE_ID, micro16DurationFrames, normalizeTiming, resolveMicro16Clips} from './timeline';
import {readFileSync, existsSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Micro16Scene} from './Scene';

const near = (actual: number, expected: number, epsilon = 1e-7) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

test('authored defaults: exact requested timings, transitions, endpoints and 17-second duration', () => {
  const expected = [
    ['cloudSweep', .45, 3.26], ['cheapLegOneRight', 1.4, .4], ['cheapLegTwoLeft', 1.89, .4],
    ['cheapLegThreeRight', 2.39, .4], ['thinkingDrop', 2.95, .55],
    ['cameraDownToBash', 4.51, 1.58], ['purpleBashEntry', 5.38, .75],
    ['purpleBashStop', 6.08, .25], ['bashExpand', 6.23, .2], ['bashDescent', 6.4, 1.84],
    ['bashHighlight', 7.9, .7], ['bashWarning', 8.23, .24], ['cameraDownToBudget', 9, 1.3],
    ['purpleBudgetEntry', 9.56, .8], ['budgetAppear', 9.88, .3], ['budgetRun', 10.11, .6],
    ['smokeEnter', 9.85, .4], ['budgetDepletion', 11.07, 2.6],
    ['smokeFade', 11.08, 2.6], ['smokeShrink', 11.07, 2.6],
    ['subtitleCheap', .45, 2.5], ['subtitleMissIssues', 2.95, 1.73],
    ['subtitlePowerful', 5.23, 4.79], ['subtitleCost', 10.02, 6.98],
  ] as const;
  const linear = new Set(['cheapLegOneRight', 'cheapLegTwoLeft', 'cheapLegThreeRight', 'purpleBashEntry', 'bashHighlight', 'budgetRun', 'budgetDepletion',
    'subtitleCheap', 'subtitleMissIssues', 'subtitlePowerful', 'subtitleCost']);
  for (const [key, at, duration] of expected) {
    assert.deepEqual(MICRO_16_TIMELINE[key], {at, duration, from: {progress: 0}, to: {progress: 1},
      transition: {type: 'easing', duration, ease: linear.has(key) ? [0, 0, 1, 1] : [.45, 0, .55, 1]}});
  }
  assert.equal(MICRO_16_TIMELINE.duration, 17);
  const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  assert.match(app, /\/\/ TODO\(production\): DialKit's clip.current values are the scrubbable authoring preview\.\n  \/\/ Replace them with equivalent real Motion animations using the tuned timeline\n  \/\/ timings and transitions, then remove useDialTimeline and <DialTimeline \/>\.\n  const timeline = useDialTimeline/);
});

test('four independently timed subtitles render above the scene', () => {
  const markup = renderToStaticMarkup(createElement(Micro16Scene, {state: sampleMicro16(1.7)}));
  for (const text of ['Cheap LLMs can read trace efficiently', 'but fail to find crucial issues.',
    'More powerful LLMs can find deep obscure issues', 'but the costs are unsustainable.']) assert.ok(markup.includes(text));
  assert.ok(markup.includes('class="micro16-subtitle" style="opacity:1">Cheap LLMs'));
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.micro16-subtitle-layer\{[^}]*z-index:6/);
});

test('geometry: exact Figma rows, border-box grid and documented half-cell seams', () => {
  assert.deepEqual(TRACES, [{x: -140, y: 61}, {x: -20, y: 301}, {x: -260, y: 541}]);
  for (const trace of [...TRACES, {x: BASH.x, y: BASH.y}, {x: -20, y: BUDGET_TRACE_Y}]) {
    near((trace.x - GRID.x) % GRID.pitch, 0); near((trace.y - GRID.y) % GRID.pitch, 0);
  }
  for (const block of BLOCKS) {near(block.x % GRID.seam, 0); near(block.width % GRID.seam, 0);}
  for (const file of Object.values(ASSETS)) assert.ok(existsSync(new URL(`../../../public/micro-16/${file}`, import.meta.url)));
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  assert.match(css, /box-sizing:border-box/);
});

test('clouds: one continuous sweep with no intermediate hold, fully outside at completion', () => {
  assert.deepEqual(CLIP_KEYS.filter(key => key.startsWith('cloud')), ['cloudSweep']);
  let previous = sampleMicro16(.45).cloud;
  for (let t = .467; t < 3.71; t += .017) {
    const {cloud} = sampleMicro16(t);
    assert.ok(cloud.progress > previous.progress);
    assert.ok(cloud.translateY > previous.translateY);
    assert.equal(cloud.yOffset, 37);
    near(cloud.translateY, cloud.progress * 900);
    previous = cloud;
  }
  const final = sampleMicro16(3.71).cloud;
  for (const rect of interpolateCloudRects(final.progress, final.yOffset, final.translateY)) assert.ok(rect.y >= 720);
  assert.deepEqual(sampleMicro16(10).cloud, final);
  const source = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8');
  assert.match(source, /<DitherClouds \{\.\.\.s.cloud\}/);
});

test('cheap agents: separate full-width right/left/right passes with no vertical motion', () => {
  const keys = ['cheapLegOneRight', 'cheapLegTwoLeft', 'cheapLegThreeRight'] as const;
  keys.forEach((key, row) => {
    const {at, duration} = DEFAULT_TIMING[key];
    const start = sampleMicro16(at).cheapAgents[row];
    const end = sampleMicro16(at + duration).cheapAgents[row];
    assert.equal(start.x, row === 1 ? 1360 : -80);
    near(end.x, row === 1 ? -80 : 1360);
    near(sampleMicro16(at + duration / 2).cheapAgents[row].x, 640);
    for (let t = 0; t <= 6; t += .02) assert.equal(sampleMicro16(t).cheapAgents[row].y, 121 + 240 * row);
  });
  for (const time of [0, 1.85, 2.34, 2.9]) {
    assert.ok(sampleMicro16(time).cheapAgents.every(agent => agent.x + 60 <= 0 || agent.x - 60 >= 1280), 'agents fully offscreen between passes');
  }
  const overlap = {cheapLegTwoLeft: {...DEFAULT_TIMING.cheapLegTwoLeft, at: 1.4}};
  const agents = sampleMicro16(1.6, DEFAULTS, overlap).cheapAgents;
  assert.ok(agents[0].x > 0 && agents[0].x < 1280 && agents[1].x > 0 && agents[1].x < 1280);
  assert.equal(agents[0].y, 121); assert.equal(agents[1].y, 361);
  assert.ok(DEFAULTS.cheapSpinnerSpeed > DEFAULTS.purpleSpinnerSpeed * 4);
});

test('cheap spinner: exact Ultimate white-agent outline, independently adjustable stroke', () => {
  const ultimate = readFileSync(new URL('../../../public/micro-07/spinner.svg', import.meta.url), 'utf8');
  assert.ok(ultimate.includes(`d="${CHEAP_SPINNER_PATH}"`));
  const thin = sampleMicro16(2); const thick = sampleMicro16(2, {cheapSpinnerStrokeWidth: 7});
  assert.equal(thin.controls.cheapSpinnerStrokeWidth, 1.5);
  assert.equal(thick.controls.cheapSpinnerStrokeWidth, 7);
  assert.deepEqual(thin.cheapAgents, thick.cheapAgents);
  assert.deepEqual(thin.bashAgent, thick.bashAgent);
  assert.equal(sampleMicro16(2, {cheapSpinnerStrokeWidth: NaN}).controls.cheapSpinnerStrokeWidth, 1.5);
  assert.equal(sampleMicro16(2, {cheapSpinnerStrokeWidth: 99}).controls.cheapSpinnerStrokeWidth, 12);
  const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8');
  assert.match(scene, /strokeWidth=\{s.controls.cheapSpinnerStrokeWidth\}/);
  assert.match(scene, /d=\{CHEAP_SPINNER_PATH\}/);
});

test('same-plane camera: downward continuous travel, deep descent and left-edge warning/highlight', () => {
  let previous = sampleMicro16(0);
  for (let t = .02; t < 16; t += .02) {
    const state = sampleMicro16(t);
    assert.ok(state.camera.y >= previous.camera.y - 1e-7);
    assert.ok(state.camera.y - previous.camera.y < 65);
    previous = state;
  }
  const deep = sampleMicro16(8.6);
  assert.equal(deep.bashAgent.x, BASH.x);
  assert.ok(BASH.y + 120 - deep.camera.y < 0, 'starting trace completely above viewport');
  near(deep.bashAgent.y - deep.camera.y, 361);
  assert.ok(deep.descent > 720 * 2);
  assert.ok(deep.warning.x + 86.797 < deep.bashAgent.x);
  assert.ok(deep.warning.y + 80.604 < deep.bashAgent.y);
  near(deep.warning.scale, 1);
  near(deep.progress.bashHighlight, 1);
  for (const line of HIGHLIGHT_LINES) {
    const screenY = BASH.y + line * PAPER_LINE_HEIGHT - deep.camera.y;
    assert.ok(screenY > 100 && screenY < 500);
    assert.ok(PAPER_LINES[line].length <= 23);
  }
  assert.ok(PAPER_LINES.length * PAPER_LINE_HEIGHT <= BASH.paperHeight);
  near(sampleMicro16(16).camera.y, 4200);
});

test('Bash spinner: pauses at the block, resumes during descent, and holds at the bottom', () => {
  const stopped = sampleMicro16(6.33).bashAgent;
  for (const time of [6.33, 6.36, 6.4]) assert.deepEqual(sampleMicro16(time).bashAgent, stopped);
  assert.equal(sampleMicro16(5.3).bashAgent.angle, 0);
  assert.ok(sampleMicro16(6).bashAgent.angle < stopped.angle);
  assert.ok(sampleMicro16(6.5).bashAgent.angle > stopped.angle);
  const bottom = sampleMicro16(8.24).bashAgent;
  for (const time of [8.3, 9, 10, 17, 100]) {
    const held = sampleMicro16(time).bashAgent;
    near(held.x, bottom.x); near(held.y, bottom.y); near(held.angle, bottom.angle);
  }
  near(stopped.angle, (6.33 - 5.38) * DEFAULTS.purpleSpinnerSpeed * 360);
  near(bottom.angle - stopped.angle, 1.84 * DEFAULTS.purpleSpinnerSpeed * 360);
  assert.deepEqual(sampleMicro16(6.36).bashAgent, stopped, 'rewind restores the stationary angle');
});

test('Bash spinner: retimed movement windows count overlap once and instantaneous moves add no rotation', () => {
  const clip = (at: number) => ({at, duration: 1,
    transition: {type: 'easing' as const, duration: 1, ease: [0, 0, 1, 1] as [number, number, number, number]}});
  const timing = {purpleBashEntry: clip(1), purpleBashStop: clip(1.5), bashDescent: clip(4)};
  const angle = (time: number) => sampleMicro16(time, DEFAULTS, timing).bashAgent.angle;
  const speed = DEFAULTS.purpleSpinnerSpeed * 360;
  near(angle(2.5), 1.5 * speed);
  assert.equal(angle(3.9), angle(2.5));
  near(angle(4.5), 2 * speed);
  assert.equal(angle(10), angle(5));
  const steps = {purpleBashEntry: {at: 2, duration: 0}, purpleBashStop: {at: 2, duration: 0}, bashDescent: {at: 4, duration: 0}};
  for (const time of [0, 2, 3, 4, 17]) assert.equal(sampleMicro16(time, DEFAULTS, steps).bashAgent.angle, 0);
});

test('budget: smooth nonnegative velocity, monotonic angle, center-follow, fill and smoke decay', () => {
  let before = sampleMicro16(11.59);
  for (let t = 11.6; t <= 14.84; t += .01) {
    const s = sampleMicro16(t);
    assert.ok(s.budgetRemaining <= before.budgetRemaining + 1e-8);
    assert.ok(s.budgetSpeed <= before.budgetSpeed + 1e-8);
    assert.ok(s.smokeScale <= before.smokeScale + 1e-8);
    assert.ok(s.budgetAgent.angle >= before.budgetAgent.angle - 1e-8);
    assert.ok(s.budgetAgent.x >= before.budgetAgent.x - 1e-8);
    near(s.budgetAgent.x - s.camera.x, 640); near(s.budgetAgent.y - s.camera.y, 361);
    assert.ok(s.budgetMarker >= 0 && s.budgetMarker <= 259);
    before = s;
  }
  near(markerCenter(144 / 259), 130);
  const nearEmpty = sampleMicro16(13.3);
  assert.ok(nearEmpty.budgetSpeed > 0);
  const fillWidth = BUDGET.width * nearEmpty.budgetRemaining;
  const radius = BUDGET.marker / 2;
  // A full one-pixel row inside the bar must still expose colored fill to the
  // left of the circle, not merely a mathematically visible boundary point.
  const circleLeft = nearEmpty.budgetMarker - Math.sqrt(radius ** 2 - (BUDGET.height / 2 - 1) ** 2);
  assert.ok(Math.min(fillWidth, circleLeft) > 10, 'near-empty red is not hidden by the dollar marker');
  const t = 13; const delta = 1e-4;
  const derivative = (sampleMicro16(t + delta).budgetAgent.x - sampleMicro16(t - delta).budgetAgent.x) / (2 * delta);
  near(derivative, sampleMicro16(t).budgetSpeed, 1e-4);
  const angleDerivative = (sampleMicro16(t + delta).budgetAgent.angle - sampleMicro16(t - delta).budgetAgent.angle) / (2 * delta);
  near(angleDerivative, sampleMicro16(t).budgetPower * DEFAULTS.purpleSpinnerSpeed * 360, 1e-4);
  assert.ok(sampleMicro16(12).puffs.length > 0);
});

test('permanent actual halt: position, camera, spinner and all smoke stop forever', () => {
  const stop = sampleMicro16(14.46);
  for (const time of [14.46, 15, 16.99, 100, 100000]) {
    const state = sampleMicro16(time);
    assert.deepEqual(state.budgetAgent, stop.budgetAgent); assert.deepEqual(state.camera, stop.camera);
    assert.equal(state.budgetSpeed, 0); assert.equal(state.budgetRemaining, 0);
    assert.equal(state.smokeScale, DEFAULTS.smokeMinimumScale); assert.equal(state.smokeOpacity, 0);
    assert.ok(state.smokeBounds.width > 0); assert.deepEqual(state.smokeBounds, stop.smokeBounds);
    assert.ok(state.puffs.every(p => p.opacity === 0)); assert.deepEqual(state.puffs, stop.puffs);
  }
  assert.ok(sampleMicro16(14.459).budgetSpeed < .001);
});

test('retiming and rewind: shared frame sampler, finite inputs, zero clips and integrated overlap', () => {
  const shifted = Object.fromEntries(CLIP_KEYS.map(k => [k, {...DEFAULT_TIMING[k], at: DEFAULT_TIMING[k].at + 2}])) as typeof DEFAULT_TIMING;
  for (const time of [23, 3, 28, 0, 12, 23, 13.5, 27]) {
    assert.deepEqual(sampleMicro16Frame(time * 30), sampleMicro16(time));
    const expected = sampleMicro16(time); const actual = sampleMicro16(time + 2, DEFAULTS, shifted);
    near(actual.camera.x, expected.camera.x); near(actual.camera.y, expected.camera.y);
    near(actual.budgetAgent.angle, expected.budgetAgent.angle);
  }
  assert.deepEqual(sampleMicro16(-1), sampleMicro16(0));
  assert.deepEqual(sampleMicro16(Infinity), sampleMicro16(0));
  assert.deepEqual(sampleMicro16(NaN), sampleMicro16(0));
  const zero = Object.fromEntries(CLIP_KEYS.map(k => [k, {at: 0, duration: 0}])) as typeof DEFAULT_TIMING;
  const result = sampleMicro16(0, {travelSpeed: NaN, smokeSize: -2}, zero);
  assert.equal(result.budgetSpeed, 0); assert.equal(result.budgetClock, 0);
  assert.ok(Object.values(result.camera).every(Number.isFinite));
  assert.ok(Object.values(result.progress).every(value => value === 1));
  const overlap = normalizeTiming({...DEFAULT_TIMING, budgetRun: {at: 1, duration: 3}, budgetDepletion: {at: 2, duration: 4}});
  let previous = 0;
  for (let t = 0; t < 9; t += .03) {
    const clock = integratedBudgetClock(t, overlap); assert.ok(clock >= previous - 1e-8); previous = clock;
  }
  near(integratedBudgetClock(100, overlap), integratedBudgetClock(6, overlap));
});

test('authored zero-duration tracks step immediately at their start, including endpoint geometry', () => {
  const steps = Object.fromEntries(CLIP_KEYS.map(key => [key, {at: 2, duration: 0}])) as typeof DEFAULT_TIMING;
  const before = sampleMicro16(2 - 1e-6, DEFAULTS, steps);
  const at = sampleMicro16(2, DEFAULTS, steps);
  assert.ok(Object.values(before.progress).every(value => value === 0));
  assert.ok(Object.values(at.progress).every(value => value === 1));
  assert.deepEqual(before.camera, {x: 0, y: 0});
  assert.deepEqual(at.camera, {x: 0, y: 4200});
  assert.equal(before.paperHeight, 0); assert.equal(at.paperHeight, BASH.paperHeight);
  assert.deepEqual(at.cheapAgents.map(({x, y}) => [x, y]), [[1360, 121], [-80, 361], [1360, 601]]);
  assert.equal(at.bashAgent.x, BASH.x); assert.equal(at.descent, BASH.descent);
  assert.equal(at.warning.scale, 1); assert.equal(at.budgetRemaining, 0);
  assert.deepEqual(sampleMicro16(2 - 1e-6, DEFAULTS, steps), before, 'rewind restores pre-step geometry');
});

test('Remotion: stylesheet registered and retimed duration ends at the latest effective endpoint', () => {
  const styles = readFileSync(new URL('../../video/styles-entry.ts', import.meta.url), 'utf8');
  assert.match(styles, /import '\.\.\/experiments\/micro-16\/styles\.css'/);
  const root = readFileSync(new URL('../../video/Root.tsx', import.meta.url), 'utf8');
  assert.match(root, /calculateMetadata=\{\(\{props\}\) => \(\{durationInFrames: micro16DurationFrames\(props.timing\)\}\)\}/);
  assert.equal(micro16DurationFrames(), 510);
  const shifted = Object.fromEntries(CLIP_KEYS.map(key => [key, {...DEFAULT_TIMING[key], at: DEFAULT_TIMING[key].at + 3}])) as typeof DEFAULT_TIMING;
  const frames = micro16DurationFrames(shifted);
  assert.equal(frames, 600);
  assert.ok(sampleMicro16Frame(509, DEFAULTS, shifted).progress.subtitleCost < 1, 'fixed 17-second duration truncates a retimed subtitle');
  const final = sampleMicro16Frame(frames - 1, DEFAULTS, shifted);
  assert.equal(final.budgetSpeed, 0); assert.equal(final.budgetRemaining, 0);
  assert.deepEqual(final.budgetAgent, sampleMicro16(17.83, DEFAULTS, shifted).budgetAgent);
  const spring = normalizeTiming({bashWarning: {at: 40, duration: .1, transition: {type: 'spring', stiffness: 100, damping: 10, mass: 1}}});
  const effective = resolveMicro16Clips(spring).find(clip => clip.key === 'bashWarning')!;
  assert.ok(effective.duration > .1);
  assert.ok(micro16DurationFrames(spring) / 30 >= effective.at + effective.duration);
  assert.equal(micro16DurationFrames({bashWarning: {at: 40, duration: 0}}), 1200);
  assert.equal(micro16DurationFrames({budgetDepletion: {at: NaN, duration: -1}}), 510);
});

test('rendering: output is clipped below the moving door and smoke paints behind the foreground', () => {
  const state = sampleMicro16(6.9);
  const markup = renderToStaticMarkup(createElement(Micro16Scene, {state}));
  const boundary = 120 * (1 - state.progress.bashExpand);
  assert.ok(markup.includes(`clip-path:inset(${boundary}px 0 0 0)`), 'output needs the moving door-bottom clip, not just foreignObject overflow');
  assert.ok(markup.indexOf('micro16-grid') < markup.indexOf('micro10-puffs'), 'grid is the only layer behind smoke');
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  for (const [index, layer] of ['micro16-grid', 'micro10-puffs', 'micro10-photo', 'micro16-world', 'micro16-overlay', 'micro09-clouds'].entries()) {
    assert.ok(css.includes(`.micro16-scene>.${layer}{z-index:${index}}`), `${layer} must override inherited renderer stacking`);
  }
  assert.ok(markup.indexOf('micro10-puffs') < markup.indexOf('micro16-world'), 'puffs must paint behind traces and agents');
  assert.ok(markup.indexOf('micro10-photo') < markup.indexOf('micro16-world'), 'main smoke must paint behind traces and agents');
  assert.ok(markup.indexOf('micro16-world') < markup.indexOf('micro16-overlay'), 'budget badge remains above foreground');
});

test('budget color: fully red below 25 percent, through exhaustion', () => {
  for (const remaining of [.25, .1, 0]) {
    const state = {...sampleMicro16(13), budgetRemaining: remaining};
    const markup = renderToStaticMarkup(createElement(Micro16Scene, {state}));
    assert.ok(markup.includes('stop-color="rgb(239,141,143)"'));
    assert.ok(markup.includes('stop-color="rgb(242,116,125)"'));
  }
  for (const time of [13.7, 14.1, 14.83, 17]) {
    const state = sampleMicro16(time);
    assert.ok(state.budgetRemaining <= .25);
    const markup = renderToStaticMarkup(createElement(Micro16Scene, {state}));
    assert.ok(markup.includes('stop-color="rgb(239,141,143)"'), `top stop must be fully red at ${time}s`);
    assert.ok(markup.includes('stop-color="rgb(242,116,125)"'), `bottom stop must be fully red at ${time}s`);
  }
});

test('DialKit: independent labels, curve parity and old blank persistence compatibility', () => {
  assert.equal(MICRO_16_TIMELINE_ID, 'micro-animation-16-timeline-v1');
  assert.equal(CLIP_KEYS.length, 24);
  // Installed DialKit persists flat clip values, not the config duration. The
  // former blank persisted {}. Even a stale legacy duration key is ignored.
  const parsed = parseTimelineConfig(MICRO_16_TIMELINE);
  for (const saved of [{}, {duration: 5}, {timelineDuration: 5}] as Record<string, number>[]) {
    const restored = computeStaticTimeline(parsed, saved);
    assert.equal(restored.duration, MICRO_16_DURATION);
    assert.equal(restored.clips.length, CLIP_KEYS.length);
  }
  const {clips} = computeStaticTimeline(parsed, {});
  for (const time of [1, 7, 9, 14, 23]) {
    const state = sampleMicro16(time);
    for (const clip of clips) near(state.progress[clip.key as keyof typeof state.progress],
      (computeClipState(clip, time, time) as {current: {progress: number}}).current.progress);
  }
  const custom = {...DEFAULT_TIMING, bashExpand: {at: 7, duration: 2, transition: {type: 'easing' as const, duration: 2, ease: [0,0,1,1] as [number,number,number,number]}}};
  near(sampleMicro16(8, DEFAULTS, custom).progress.bashExpand, .5);
});
