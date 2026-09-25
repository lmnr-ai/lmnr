import assert from 'node:assert/strict';
import {BLOCKS, ELBOW, STRAIGHT_LENGTH, VERTICAL_LENGTH} from '../micro-07/geometry';
import {blockReveal} from '../micro-07/routeMask';
import {worldState as originalWorld, visibleBlocks as originalBlocks} from '../micro-12/geometry';
import {sampleMicro12} from '../micro-12/sample';
import {DEFAULTS, routeLayout, visibleRouteBlocks, worldState} from './geometry';
import {sampleMicro17} from './sample';
import {MICRO_17_TIMELINE as T, timingWarnings, DEFAULT_TIMING} from './timeline';

const close = (a: number, b: number, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const at = (time: number) => worldState(sampleMicro17(time));
assert.deepEqual(timingWarnings(DEFAULT_TIMING), []);
// Opening travel, intro camera, scales and original first/repeating block assets
// remain Animation 12's; no first-Thinking/intro-cloud replacement shot.
for (const t of [0, .3, .6, .93, 1.9, 2, 3.3]) {
  const s = at(t); const old = originalWorld(sampleMicro12(t));
  for (const key of ['head', 'cameraFocus', 'scale', 'contentScale', 'agentScale', 'loaderAngle'] as const) close(s[key], old[key], key === 'head' ? .01 : 1e-8);
  const now = visibleRouteBlocks(s, -640, 640).filter(b => !b.key.startsWith('tail'));
  const before = originalBlocks(old.head, -640, 640, old.liftCycle);
  assert.deepEqual(now.map(({y, w, h, asset, label}) => ({y, w, h, asset, label})),
    before.map(({y, w, h, asset, label}) => ({y, w, h, asset, label})));
  now.forEach((block, index) => close(block.x, before[index].x, .01));
}
for (let frame = 0; frame <= Math.floor(T.finalZoom.at * 30); frame++) assert.equal(at(frame / 30).scale, 1);
const route = routeLayout(T.streamRun.duration, DEFAULTS.streamerSpeed);
close(route.runEnd, 2094); assert.equal(route.elbowX, 2520); assert.equal(route.liftCycle, 2);
assert.ok(route.elbowX >= route.runEnd);
const straightBeforeLift = visibleRouteBlocks(at(T.upwardTurn.at), -10000, 10000).filter(block => !block.key.startsWith('tail-'));
assert.deepEqual(straightBeforeLift.map(block => block.id), [
  'thinking-blue', 'turn-top', 'read', 'turn-right', 'thinking-red', 'turn-left',
], 'fourteen authored stream blocks are removed immediately before the lifting blue Thinking block');
for (const speed of [0, 240, 660, 1200]) for (const duration of [0, .1, 2, 6.9, 30]) {
  const r = routeLayout(duration, speed);
  assert.ok(r.elbowX >= r.runEnd);
  assert.ok(r.elbowX - r.runEnd < 2040);
}
// Agent/world/camera continuity at both joins, with a genuine upward route.
const turn = T.upwardTurn.at;
for (const t of [T.continueStraight.at, turn, turn + T.upwardTurn.duration]) {
  const a = at(t - 1e-7); const b = at(t + 1e-7);
  assert.ok(Math.abs(a.head - b.head) < .001);
  assert.ok(Math.abs(a.agentY - b.agentY) < .001);
  assert.ok(Math.abs(a.cameraFocus - b.cameraFocus) < .001);
}
for (const fraction of [.01, .1, .5, 1]) {
  const s = at(turn + T.upwardTurn.duration * fraction);
  close(s.head, route.elbowX);
  // DialKit's cubic-bezier solver approximates linear easing to subpixels.
  assert.ok(Math.abs(s.agentY + VERTICAL_LENGTH * fraction) < .01);
  close(s.cameraFocus, 0);
}
// Canonical 7 reveal, not an approximated route-wide rectangular cut. Compare
// native reveal regions after translating back, including corner peeking.
for (const distance of [route.elbowX - 15, route.elbowX, route.elbowX + 30, route.elbowX + 60, route.elbowX + 300]) {
  const base = at(turn);
  const head = Math.min(route.elbowX, distance); const rise = Math.max(0, distance - route.elbowX);
  const blocks = visibleRouteBlocks({...base, head, rise, distance}, -2000, 2000);
  for (const block of blocks.filter(b => b.key.startsWith('tail-'))) {
    const native = BLOCKS.find(b => `tail-${b.id}` === block.key)!;
    const expected = blockReveal(native, distance - (route.elbowX - STRAIGHT_LENGTH));
    const dx: number = route.elbowX - ELBOW.x - head;
    assert.deepEqual(block.reveal, {complete: expected.complete,
      rects: expected.rects.map(r => ({...r, x: r.x + dx, y: r.y - 300})),
      circles: expected.circles.map(c => ({...c, cx: c.cx + dx, cy: c.cy - 300}))});
  }
}
const approaching = visibleRouteBlocks({...at(turn), head: route.elbowX - 15, distance: route.elbowX - 15}, -200, 200).find(b => b.id === 'elbow-icon')!;
assert.equal(approaching.reveal.rects[0].width, 45);
const turning = visibleRouteBlocks(at(turn), -200, 200).find(b => b.id === 'elbow-icon')!;
assert.equal(turning.reveal.complete, false); assert.equal(turning.reveal.circles.length, 1);
const lifted = at(T.warningFocus.at - .35);
const doors = visibleRouteBlocks(lifted, -2000, 2000).filter(b => b.lift);
assert.deepEqual(doors.map(b => b.id), ['thinking-blue', 'read', 'thinking-red']);
assert.ok(doors.every(b => b.reveal.complete));
close(lifted.head + lifted.cameraFocus, route.liftCenter);
const blue = doors[0];
close(lifted.warning.x, blue.x + blue.w); close(lifted.warning.y, -180);
// Warning replaces the center agent before any scale change. No off-center
// final zoom and no trace spill outside the rebased center-cell clip.
for (let frame = Math.ceil(T.finalZoom.at * 30); frame < 30 * T.cloudEnter.at; frame++) {
  const s = at(frame / 30);
  close(640 + (s.warning.x - s.cameraFocus) * s.scale, 640);
  close(360 + s.warning.y * s.scale, 360);
  if (s.heroClip) close((s.heroClip.x + s.heroRebase.x) * s.contentScale * s.scale, -2400 * s.scale);
}
for (const t of [T.cloudHold.at, T.cloudHold.at + 2, T.cloudHold.at + T.cloudHold.duration, 100, 1e12]) {
  const s = at(t); assert.equal(s.cloudProgress, 0); assert.equal(s.cloudTranslateY, 0);
  assert.deepEqual(s.cloudTranslateX.map(x => x || 0), [0, 0]);
}
assert.deepEqual(at(T.cloudHold.at + T.cloudHold.duration), at(1e12));
console.log('PASS: Animation 12 opening parity; no early zoom; continuous 7 elbow/masks; visited doors; centered warning; permanent cover');
