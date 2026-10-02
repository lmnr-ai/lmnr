import assert from 'node:assert/strict';
import {BLOCK_TEMPLATE, CELL, DEFAULTS, GRID, HERO_CLIP_LEFT, OPENING_CLOUDS, PERIOD, offsetForCell, openingCloudBounds, openingCloudX, visibleBlocks, worldState} from './geometry';
import {livePlayback, sampleMicro12} from './sample';
import {CLIP_KEYS, MICRO_12_TIMELINE} from './timeline';
import {sampleMicro09} from '../micro-09/sample';

const near = (a: number, b: number, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const rawAt = (t: number) => worldState(sampleMicro12(t));
// Most assertions retain their pre-retime semantic timestamps; map the whole
// post-intro edit block through its deliberate 0.8-second shift.
const at = (t: number) => rawAt(t >= 5 ? t + .8 : t);
assert.equal(openingCloudX('back', 0), OPENING_CLOUDS.back.x);
assert.equal(openingCloudX('back', 0, 40), OPENING_CLOUDS.back.x + 40, 'each opening cloud accepts its own x offset');
assert.equal(openingCloudBounds('back', 0, 0).width, 0, 'opening cloud starts scaled out');
near(openingCloudBounds('back', 0, .5).x + openingCloudBounds('back', 0, .5).width / 2,
  OPENING_CLOUDS.back.x + OPENING_CLOUDS.back.width / 2);
assert.deepEqual(openingCloudBounds('back', 0, 1), OPENING_CLOUDS.back);
assert.ok(openingCloudX('back', 1200) + OPENING_CLOUDS.back.width < -640,
  'grid-pinned opening cloud leaves the viewport after the agent advances');
assert.equal(at(0).agentScale, 0);
near(at(0).introCameraFocus, 0, 1e-5);
near(at(.23).introCameraFocus, 0, 1e-5);
near(at(.58).introCameraFocus, -CELL * DEFAULTS.introCameraOffsetCells / 2, 1e-5);
near(at(.93).introCameraFocus, -CELL * DEFAULTS.introCameraOffsetCells, 1e-5);
near(at(1.5).introCameraFocus, -90, 1e-5);
near(at(2.06).introCameraFocus, -45, 1e-5);
near(at(2.22).introCameraFocus, 0, 1e-5);
assert.equal(at(0).streamVisible, false, 'entire stream is hidden during agent entry');
assert.equal(at(.3).streamVisible, false, 'stream stays hidden until agent entry completes');
assert.equal(at(.32).streamVisible, true, 'unmasked stream appears after agent entry');
near(at(.93).head, 300);
near(at(1.5).head, 300, .001);
assert.equal(BLOCK_TEMPLATE.reduce((sum, block) => sum + block.w, 0), PERIOD);
assert.ok(BLOCK_TEMPLATE.every(block => !block.vertical));
assert.equal(PERIOD % CELL, 0);
near(at(5).scale, 1);
near(at(5).smokeOpacity, 1);
near(at(6.2).scale, 1 / DEFAULTS.maxZoom);
near(at(6.2).smokeOpacity, 0);
near(worldState(sampleMicro12(7), {...DEFAULTS, footballSmokeMinOpacity: .47}).smokeOpacity, .47);
near(at(6.2).heroClipLeft, -GRID.pitch / (2 * at(6.2).contentScale));
near(at(7.4).scale, 1);
near(at(7.4).smokeOpacity, 1);
assert.equal(at(5).centerCellColor, 'rgb(26, 26, 26)');
assert.equal(at(6.2).centerCellColor, 'rgb(51, 51, 51)');
assert.equal(at(7.4).centerCellColor, 'rgb(26, 26, 26)');
assert.notEqual(at(5.6).centerCellColor, at(5).centerCellColor, 'center cell fades during ascent');
assert.notEqual(at(6.8).centerCellColor, at(6.2).centerCellColor, 'center cell fades back during descent');
assert.ok(Math.abs(at(6.2).scale - at(6.199).scale) < .00001, 'zoom slows down at apex');
assert.ok(at(6.2).head > at(5).head, 'stream continues during football zoom');
for (const time of [5, 5.5, 6.2, 7, 7.4]) {
  const state = at(time);
  assert.equal(state.smallGridUbiquitous, false, 'football keeps grids cell-local');
  assert.equal(state.streamHeight, 1);
  assert.equal(state.loaderOpacity, 1);
  assert.equal(state.smallGridOpacity, 1);
  assert.equal(state.dotColor, 'rgb(255, 255, 255)');
  assert.equal(state.neighborsAreDots, false);
  near(CELL * state.contentScale * state.scale, 120 * state.contentScale * state.scale);
}
near(at(8).head, at(11).head);
assert.equal(at(9.6).neighborsAreDots, true);
assert.equal(at(9.6).smallGridUbiquitous, true, 'warning/lift grid is viewport-wide');
assert.ok(at(9.6).focus < -640, 'original head is offscreen during lifts');
assert.equal(at(9.6).heroClipLeft, HERO_CLIP_LEFT, 'ungridded backtrack is not cropped to the hero cell');
assert.ok(HERO_CLIP_LEFT < (at(9.6).focus - 640 / at(9.6).scale) / at(9.6).contentScale);
const lifts = visibleBlocks(at(9.6).head, -10000, 0, at(9.6).liftCycle).filter(block => block.lift);
assert.deepEqual(lifts.map(block => block.id), ['thinking-blue', 'read', 'thinking-red']);
assert.ok(lifts.every(block => block.x + block.w <= 0), 'all lifted blocks have been visited');
const warningVisible = at(10.7);
assert.ok(warningVisible.warning.scale > .99);
assert.ok(warningVisible.warning.x - warningVisible.focus < 200, 'warning sits close to the paper');
const zoomStart = at(11.7);
near(zoomStart.cameraFocus, zoomStart.warning.x);
const finalGrid = at(13.7);
near(finalGrid.cameraFocus, finalGrid.warning.x);
near(finalGrid.gridOrigin.x, finalGrid.warning.x);
near(finalGrid.gridOrigin.y, finalGrid.warning.y);
near(640 - finalGrid.cameraFocus * finalGrid.scale + finalGrid.warning.x * finalGrid.scale, 640);
near(360 - finalGrid.cameraFocusY * finalGrid.scale + finalGrid.warning.y * finalGrid.scale, 360);
near(640 - finalGrid.cameraFocus * finalGrid.scale + finalGrid.gridOrigin.x * finalGrid.scale, 640);
near(360 - finalGrid.cameraFocusY * finalGrid.scale + finalGrid.gridOrigin.y * finalGrid.scale, 360);
near(114.269 * finalGrid.warning.scale * finalGrid.scale, 25.41796875);
near(finalGrid.heroAgentOpacity, 0);
for (let frame = 352; frame <= 411; frame++) {
  const state = at(frame / 30);
  const warningHalfWidth = 57.1345 * state.warning.scale;
  assert.ok(Math.abs(state.warning.x - state.gridOrigin.x) + warningHalfWidth <= GRID.pitch / 2,
    `warning escaped center cell at frame ${frame}`);
}
near(at(13.7).scale * GRID.pitch, 100);
assert.equal(at(11.7).heroClipLeft, HERO_CLIP_LEFT, 'clip changes only after final zoom becomes visible');
const firstZoomFrame = at(352 / 30);
near((firstZoomFrame.heroRebase.x + firstZoomFrame.heroClipLeft) * firstZoomFrame.contentScale, -GRID.pitch / 2);
near((firstZoomFrame.heroRebase.x + firstZoomFrame.heroClipLeft + firstZoomFrame.heroClipWidth) * firstZoomFrame.contentScale, GRID.pitch / 2);
assert.ok(640 + (firstZoomFrame.heroRebase.x + firstZoomFrame.heroClipLeft) * firstZoomFrame.contentScale * firstZoomFrame.scale < 0,
  'cell clip boundary begins outside the viewport instead of cutting through the lifted scene');
near(at(13.7).scale * at(13.7).contentScale * 120, 12);
assert.equal(at(13.7).streamHeight, 0);
assert.equal(at(13.7).smallGridOpacity, 0);
assert.equal(at(13.7).dotColor, 'rgb(78, 78, 78)');
assert.equal(at(14.2).cloudEnter, 0);
assert.deepEqual(at(14.2).cloudTranslateX, [-DEFAULTS.cloudEntrySpread, DEFAULTS.cloudEntrySpread]);
const cloudMid = at(14.9);
assert.ok(cloudMid.cloudTranslateX[0] < 0 && cloudMid.cloudTranslateX[0] > -DEFAULTS.cloudEntrySpread);
assert.equal(cloudMid.cloudTranslateX[0], -cloudMid.cloudTranslateX[1]);
near(at(15.6).cloudEnter, 1);
near(at(15.6).cloudTranslateX[0], 0);
near(at(15.6).cloudTranslateX[1], 0);
near(at(15.6).gridBlend, 1);
assert.deepEqual(at(15.6).finale, sampleMicro09(0));
assert.deepEqual(at(16.6).finale, sampleMicro09(0), 'clouds hold fully entered before Animation 9');
for (const localTime of [.5, 1.25, 2.5]) {
  const sourceTime = localTime / 2.5 * 6;
  const finale = at(17.6 + localTime).finale;
  near(finale.time, sampleMicro09(sourceTime).time, .001);
  near(finale.progress, sampleMicro09(sourceTime).progress, .001);
}
const playback = sampleMicro12(3);
const live = {time: playback.time, ...Object.fromEntries(CLIP_KEYS.map(key => [key, {current: {progress: playback.progress[key]}, duration: MICRO_12_TIMELINE[key].duration}]))};
assert.deepEqual(livePlayback(live as Parameters<typeof livePlayback>[0]), playback);
assert.equal(MICRO_12_TIMELINE.firstThinking.duration, .7);
assert.equal(MICRO_12_TIMELINE.streamRun.at, 1.9);
assert.equal(MICRO_12_TIMELINE.duration, 20.9);
assert.equal(MICRO_12_TIMELINE.subtitleHidden.at, MICRO_12_TIMELINE.cloudEnter.at);
assert.equal(MICRO_12_TIMELINE.subtitleBetter.at + MICRO_12_TIMELINE.subtitleBetter.duration, MICRO_12_TIMELINE.subtitleHidden.at);
assert.equal(MICRO_12_TIMELINE.subtitleIfOnly.at, MICRO_12_TIMELINE.cloudHold.at);
assert.equal(MICRO_12_TIMELINE.subtitleSignals.at, MICRO_12_TIMELINE.finale.at);
assert.equal(offsetForCell(209, 12), offsetForCell(209, 12));
assert.notEqual(offsetForCell(209, 12), offsetForCell(210, 12));
assert.notEqual(offsetForCell(209, 12), offsetForCell(209, 13));
assert.ok(visibleBlocks(1e8, -2400, 0, 0).length < 30, 'render cost does not grow with history');
assert.deepEqual(at(3), worldState(sampleMicro12(3)), 'random-access sampling');
console.log('Micro12: intro, zoom arc, fixed lifts, warning-centered final zoom, subtitles, cloud bridge, and exact finale clock passed.');
