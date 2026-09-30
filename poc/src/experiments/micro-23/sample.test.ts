import assert from 'node:assert/strict';
import {test} from 'node:test';
import {computeClipState} from 'dialkit/timeline';
import {createMicro23Sampler, DOTS, FIELD, HEADLINE_BOUNDS, LABEL_BOUNDS, NUMBER_BOUNDS, inspectionTime, micro23DurationFrames, sampleMicro23Progress, staggerProgress, TOTAL_DOTS} from './sample';
import {MICRO_23_KEYS, MICRO_23_TIMELINE, normalizeMicro23Controls} from './timeline';

test('Figma geometry, captions and 20px grid endpoint are preserved', () => {
  assert.equal(TOTAL_DOTS, 756);
  assert.equal(DOTS.filter(dot => dot.color === 'orange').length, 38);
  assert.deepEqual([DOTS[0].x, DOTS[0].y, DOTS.at(-1)!.x, DOTS.at(-1)!.y], [230, 180, 1050, 520]);
  const sampler = createMicro23Sampler(), first = sampler.sample(0), last = sampler.sample(3);
  assert.equal(first.cellSize, 60); assert.equal(first.gridY, 360);
  assert.ok(first.dots.every(dot => dot.progress === 0));
  assert.equal(last.cellSize, 20); assert.equal(last.gridY, 350);
  assert.ok(last.dots.every(dot => dot.progress === 1));
  assert.deepEqual(last.numbers, {gpt: 37, flow: 756});
  assert.equal(micro23DurationFrames(), 180);
  assert.equal(micro23DurationFrames({controls: {hold: 0}}), 120);
});

test('return zoom goes below all content and exactly restores the opening grid phase', () => {
  for (const startCellSize of [20, 37, 60, 120]) {
    const sampler = createMicro23Sampler({controls: {startCellSize}});
    const first = sampler.sample(0), end = sampler.sample(3.96);
    assert.equal(end.cellSize, first.cellSize);
    assert.ok(Math.abs((end.gridY - first.gridY) / end.cellSize + 30) < 1e-9);
    const contentBottom = Math.max(...Object.values(NUMBER_BOUNDS).map(box => box.y + box.height));
    assert.ok(end.gridY + (contentBottom - 350) * end.worldScale < 0);
    assert.ok(end.dots.every(dot => dot.progress === 1)); // moved offscreen, not faded away
    assert.deepEqual(sampler.sample(6), {...end, time: 6});
    const middle = sampler.sample(3.8);
    assert.ok(middle.cellSize > 20 || startCellSize === 20);
    sampler.sample(0);
    assert.deepEqual(sampler.sample(3.8), middle);
  }
  const delayed = createMicro23Sampler({values: {'returnToGrid.at': 10}});
  assert.equal(delayed.sample(6).cellSize, 20);
  assert.equal(delayed.sample(6).gridY, 350);
  assert.ok(delayed.duration > 12.76);
});

test('tuned defaults preserve every requested timing, transition and progress endpoint', () => {
  const expected = {
    gridShrink: [.07, .78, [.3, 0, .55, 1]],
    orangeDots: [.5, .19, [0, 0, 1, 1]],
    blueDots: [1.48, 1.04, [0, 0, 1, 1]],
    gptLabel: [.51, .2, [.2, .62, .55, .96]],
    flowLabel: [2.47, .24, [.45, 0, .55, 1]],
    gptNumber: [.5, .21, [.1, .2, .6, .92]],
    flowNumber: [2.47, .24, [.1, .2, .46, 1]],
    headlineReveal: [.41, .42, [.45, 0, .55, 1]],
    headlineFadeOut: [1.58, .19, [0, 0, 1, 1]],
    returnToGrid: [3.2, .76, [.45, 0, .55, 1]],
  };
  assert.deepEqual(Object.keys(MICRO_23_TIMELINE), Object.keys(expected));
  for (const key of MICRO_23_KEYS) {
    const [at, duration, ease] = expected[key];
    assert.deepEqual(MICRO_23_TIMELINE[key], {
      at, duration, from: {progress: 0}, to: {progress: 1},
      transition: {type: 'easing', duration, ease},
    });
  }
  // The tuned orange entrance deliberately overlaps the end of the zoom.
  const duringZoom = createMicro23Sampler().sample(.7);
  assert.ok(duringZoom.cellSize > 20 && duringZoom.cellSize < 60);
  assert.ok(duringZoom.dots[0].progress > 0);
});

test('ten separate bars: total stagger duration includes every tail', () => {
  assert.equal(MICRO_23_KEYS.length, 10);
  for (const count of [1, FIELD.orangeDots, TOTAL_DOTS - FIELD.orangeDots]) {
    for (let index = 0; index < count; index++) {
      assert.equal(staggerProgress(0, index, count, .25, 3.5), 0);
      assert.equal(staggerProgress(1, index, count, .25, 3.5), 1);
    }
    if (count > 1) assert.ok(staggerProgress(.999, count - 1, count, .25, 3.5) < 1);
  }
});

test('label and number containers occupy whole grid cells; lower row touches the field', () => {
  for (const box of [...Object.values(LABEL_BOUNDS), ...Object.values(NUMBER_BOUNDS)]) {
    assert.ok((box.x - FIELD.x) % FIELD.cell === 0);
    assert.ok((box.y - FIELD.y) % FIELD.cell === 0);
    assert.ok(box.width % FIELD.cell === 0 && box.height % FIELD.cell === 0);
  }
  assert.equal(LABEL_BOUNDS.flow.y, FIELD.y + FIELD.rows * FIELD.cell);
  assert.equal(NUMBER_BOUNDS.flow.y, LABEL_BOUNDS.flow.y);
  assert.equal(LABEL_BOUNDS.gpt.width, 180);
});

test('single-dot duration is seconds, independent of group duration, with short-bar clamping', () => {
  for (const duration of [3.5, 8]) {
    const sampler = createMicro23Sampler({values: {'blueDots.duration': duration}, controls: {dotDuration: .25}});
    const half = sampler.sample(MICRO_23_TIMELINE.blueDots.at + .125);
    assert.ok(Math.abs(half.dots[FIELD.orangeDots].progress - .875) < .001);
    assert.equal(half.dotDurations.blue, .25);
    assert.equal(sampler.sample(MICRO_23_TIMELINE.blueDots.at + duration).dots.at(-1)!.progress, 1);
  }
  const longer = createMicro23Sampler({controls: {dotDuration: .5}}).sample(MICRO_23_TIMELINE.blueDots.at + .125);
  assert.ok(longer.dots[FIELD.orangeDots].progress < .6);
  const short = createMicro23Sampler({values: {'blueDots.duration': .1}, controls: {dotDuration: .5}});
  const shortEnd = MICRO_23_TIMELINE.blueDots.at + .1;
  assert.equal(short.sample(shortEnd).dotDurations.blue, .1);
  assert.ok(short.sample(shortEnd + .01).dots.filter(dot => dot.color === 'blue').every(dot => dot.progress === 1));
});

test('headline uses the Figma rectangle and independent fold-down reveal', () => {
  assert.deepEqual(HEADLINE_BOUNDS, {x: 340, y: 290, width: 600, height: 140});
  const sampler = createMicro23Sampler();
  assert.equal(sampler.sample(.4).progress.headlineReveal, 0);
  assert.equal(sampler.sample(.4).headlineContainerVisible, false);
  assert.equal(sampler.sample(.41).headlineContainerVisible, true);
  assert.equal(sampler.sample(.41).progress.headlineReveal, 0);
  const midpoint = sampler.sample(.62);
  assert.ok(Math.abs(midpoint.progress.headlineReveal - .5) < .001);
  assert.equal(midpoint.headlineSlideOutProgress, 0);
  assert.equal(sampler.sample(.84).progress.headlineReveal, 1);
  const retimed = createMicro23Sampler({values: {'headlineReveal.at': 20}});
  assert.equal(retimed.sample(10).progress.headlineReveal, 0);
  assert.equal(retimed.sample(19.99).headlineContainerVisible, false);
  assert.equal(retimed.sample(20).headlineContainerVisible, true);
  assert.ok(retimed.duration > 22);
  for (const key of MICRO_23_KEYS.filter(key => key !== 'headlineReveal')) {
    assert.equal(retimed.sample(10).progress[key], sampler.sample(10).progress[key]);
  }
});

test('headline slide-out preserves its independent persisted bar, retimes and reverse seeks', () => {
  assert.equal(MICRO_23_TIMELINE.headlineFadeOut.at, 1.58);
  assert.equal(MICRO_23_TIMELINE.headlineFadeOut.duration, .19);
  for (const props of [{}, {values: {'headlineFadeOut.at': 10, 'headlineFadeOut.duration': 2}}]) {
    const sampler = createMicro23Sampler(props);
    const exit = sampler.clips.find(clip => clip.key === 'headlineFadeOut')!;
    const at = exit.at, end = exit.at + exit.duration;
    const middle = sampler.sample(at + exit.duration / 2);
    assert.equal(sampler.sample(at).headlineSlideOutProgress, 0);
    assert.ok(Math.abs(middle.headlineSlideOutProgress - .5) < .001);
    assert.equal(middle.headlineSlideOutProgress, middle.progress.headlineFadeOut);
    assert.equal(sampler.sample(end).headlineSlideOutProgress, 1);
    assert.equal(sampler.sample(end).headlineContainerVisible, true);
    assert.deepEqual(sampler.sample(at + exit.duration / 2), middle);
    assert.equal(sampler.sample(0).headlineSlideOutProgress, 0);
  }
  const blueRetimed = createMicro23Sampler({values: {'blueDots.at': 10}}).sample(6);
  assert.equal(blueRetimed.progress.blueDots, 0);
  assert.equal(blueRetimed.headlineSlideOutProgress, 1);
  const exitRetimed = createMicro23Sampler({values: {'headlineFadeOut.at': 10}}).sample(6);
  assert.equal(exitRetimed.progress.blueDots, 1);
  assert.equal(exitRetimed.headlineSlideOutProgress, 0);
});

test('Z order always runs left-to-right, then wraps to the left of the next row', () => {
  for (let index = 1; index < DOTS.length; index++) {
    const before = DOTS[index - 1], dot = DOTS[index];
    if (dot.row === before.row) assert.equal(dot.column, before.column + 1);
    else {assert.equal(dot.row, before.row + 1); assert.equal(dot.column, 0);}
  }
  const sampler = createMicro23Sampler();
  for (let t = 0; t <= 8; t += .037) {
    const sample = sampler.sample(t);
    for (const color of ['orange', 'blue']) {
      const dots = sample.dots.filter(dot => dot.color === color);
      for (let i = 1; i < dots.length; i++) assert.ok(dots[i].progress <= dots[i - 1].progress);
    }
  }
});

test('each label and number is independent; number fold/count share native ease-out progress', () => {
  const sampler = createMicro23Sampler();
  for (const key of ['gptNumber', 'flowNumber'] as const) {
    const clip = MICRO_23_TIMELINE[key];
    const atQuarter = sampler.sample(clip.at + clip.duration / 4);
    assert.ok(atQuarter.progress[key] > .25);
    const model = key === 'gptNumber' ? 'gpt' : 'flow';
    const target = model === 'gpt' ? 37 : 756;
    assert.equal(atQuarter.numbers[model], Math.round(target * atQuarter.progress[key]));
    assert.equal(sampler.sample(clip.at - .001).numberContainersVisible[model], false);
    assert.equal(sampler.sample(clip.at).numberContainersVisible[model], true);
    assert.equal(sampler.sample(clip.at).progress[key], 0);
    const retimed = createMicro23Sampler({values: {[`${key}.at`]: 12}});
    assert.equal(retimed.sample(11.999).numberContainersVisible[model], false);
    assert.equal(retimed.sample(12).numberContainersVisible[model], true);
    assert.deepEqual(sampler.sample(clip.at + clip.duration / 4), atQuarter);
  }
  for (const key of ['gptLabel', 'flowLabel', 'gptNumber', 'flowNumber'] as const) {
    const changed = createMicro23Sampler({values: {[`${key}.at`]: 25}}).sample(10);
    assert.equal(changed.progress[key], 0);
    for (const other of MICRO_23_KEYS.filter(other => other !== key)) assert.equal(changed.progress[other], 1);
  }
});

test('native authored from/to, easing and physics spring semantics survive serialized render props', () => {
  for (const transition of [
    {type: 'easing' as const, duration: 3, ease: [.2, .8, .4, 1] as [number, number, number, number]},
    {type: 'spring' as const, stiffness: 130, damping: 17, mass: 1},
  ]) {
    const props = {values: {'orangeDots.at': 4, 'orangeDots.duration': 3, 'orangeDots.from.progress': .2,
      'orangeDots.to.progress': .8, 'orangeDots.transition': transition}};
    const sampler = createMicro23Sampler(props), restored = createMicro23Sampler(JSON.parse(JSON.stringify(props)));
    const clip = sampler.clips.find(clip => clip.key === 'orangeDots')!;
    for (const t of [0, 4, 4.1, 4.5, 5, 7, 20]) {
      assert.deepEqual(sampler.sample(t), restored.sample(t));
      const current = computeClipState(clip, t, t).current as {progress: number};
      assert.equal(sampler.sample(t).progress.orangeDots, Math.min(1, Math.max(0, current.progress)));
    }
    assert.equal(sampler.sample(0).progress.orangeDots, .2);
    assert.equal(sampler.sample(20).progress.orangeDots, .8);
  }
});

test('long bar edits extend render duration; reverse and arbitrary seeks have no history', () => {
  const sampler = createMicro23Sampler({values: {'blueDots.at': 10, 'blueDots.duration': 8}});
  assert.ok(sampler.duration >= 20);
  const times = [0, .4, 1, 1.85, 2.1, 3.7, 6, 12, 18, 20];
  const expected = times.map(t => sampler.sample(t));
  for (const index of [9, 3, 7, 0, 8, 2, 5, 1, 6, 4]) assert.deepEqual(sampler.sample(times[index]), expected[index]);
  assert.equal(sampler.sample(18).dots.at(-1)!.progress, 1);
});

test('legacy number-slide props remain accepted but no longer affect the fold-down sample', () => {
  assert.equal(normalizeMicro23Controls({numberSlide: 2000}).numberSlide, 2000);
  assert.equal(normalizeMicro23Controls({numberSlide: 2500}).numberSlide, 2000);
  assert.equal(normalizeMicro23Controls({numberSlide: -1}).numberSlide, 0);
  const props = {controls: {numberSlide: 2000}};
  assert.equal(createMicro23Sampler(props).controls.numberSlide, 2000);
  assert.equal(createMicro23Sampler(JSON.parse(JSON.stringify(props))).controls.numberSlide, 2000);
  for (const time of [0, 1.05, 1.475, 1.9, 5.61, 5.955, 6.3]) {
    assert.deepEqual(createMicro23Sampler(props).sample(time), createMicro23Sampler().sample(time));
  }
});

test('inspection rejects malformed, infinite and negative times; controls remain finite', () => {
  for (const query of ['', '?time=', '?time=-1', '?time=NaN', '?time=Infinity']) assert.equal(inspectionTime(query), null);
  assert.equal(inspectionTime('?time=0'), 0); assert.equal(inspectionTime('?time=3.25'), 3.25);
  const controls = normalizeMicro23Controls({endCellSize: NaN, dotDiameter: -1, dotDuration: 0, hold: Infinity});
  assert.equal(controls.endCellSize, 20); assert.equal(controls.dotDiameter, 1); assert.equal(controls.dotDuration, .01);
  assert.ok(Number.isFinite(controls.hold));
});

test('shared progress seam preserves standalone 23 geometry exactly', () => {
  const sampler = createMicro23Sampler();
  for (const time of [0, .6, 1.8, 3.4, 4.1]) {
    const sample = sampler.sample(time);
    assert.deepEqual(sampleMicro23Progress(time, sample.progress, sampler.controls), sample);
  }
});
