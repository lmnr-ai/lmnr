import assert from 'node:assert/strict';
import test from 'node:test';
import {COST_LEAD_IN_DEFAULTS as settings, normalizeCurrentVoiceoverSettings} from './current-cut';
import {COST_ZIP_KEY, COST_ZIP_LEGS, costZipTimelineConfig, settingsFromCostZipTimeline} from './cost-zip-authoring';
import {sampleCost, chapterSchedule} from './sample';
import {voiceoverSchedule} from './voiceover-schedule';
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const config = costZipTimelineConfig(settings);

test('Main zip bar spans all three rungs without altering any existing timing on mount', () => {
  near(config[COST_ZIP_KEY].at, 19.6);
  near(config[COST_ZIP_KEY].duration, 1.36);
  assert.equal(settingsFromCostZipTimeline(config, settings), settings);
});

test('moving the zip shifts all three legs equally and no other action, chapter or phrase', () => {
  const next = settingsFromCostZipTimeline({[COST_ZIP_KEY]: {...config[COST_ZIP_KEY], at: 20.1}}, settings);
  for (const key of Object.keys(settings.cost.timing) as (keyof typeof settings.cost.timing)[]) {
    if ((COST_ZIP_LEGS as readonly string[]).includes(key)) near(next.cost.timing[key].at, settings.cost.timing[key].at + .5);
    else assert.deepEqual(next.cost.timing[key], settings.cost.timing[key]);
  }
  assert.deepEqual(chapterSchedule(next), chapterSchedule(settings));
  assert.deepEqual(voiceoverSchedule(next), voiceoverSchedule(settings));
  assert.deepEqual(normalizeCurrentVoiceoverSettings(JSON.parse(JSON.stringify(next))), next);
  for (const time of [2.24, 2.72, 3.2]) {
    const a = sampleCost(time, settings), b = sampleCost(time + .5, next);
    a.cheapAgents.forEach((agent, i) => near(agent.x, b.cheapAgents[i].x));
  }
});

test('resizing scales all durations and gaps, preserving the three-leg order and reversible poses', () => {
  const next = settingsFromCostZipTimeline({[COST_ZIP_KEY]: {...config[COST_ZIP_KEY], duration: 2.72}}, settings);
  const first = settings.cost.timing.cheapLegOneRight.at;
  for (const key of COST_ZIP_LEGS) {
    near(next.cost.timing[key].at, first + 2 * (settings.cost.timing[key].at - first));
    near(next.cost.timing[key].duration, settings.cost.timing[key].duration * 2);
  }
  for (const time of [3.2, 2.24, 2.72, 2.24]) {
    const a = sampleCost(time, settings), b = sampleCost(first + (time - first) * 2, next);
    a.cheapAgents.forEach((agent, i) => near(agent.x, b.cheapAgents[i].x));
  }
  near(costZipTimelineConfig(next)[COST_ZIP_KEY].duration, 2.72);
});

test('the aggregate respects raw duration and does not create sub-50ms legs', () => {
  const next = settingsFromCostZipTimeline({[COST_ZIP_KEY]: {...config[COST_ZIP_KEY], duration: 4}}, settings,
    {[`${COST_ZIP_KEY}.duration`]: .01});
  for (const key of COST_ZIP_LEGS) assert.ok(next.cost.timing[key].duration >= .05 - 1e-9);
  near(costZipTimelineConfig(next)[COST_ZIP_KEY].duration, .17);
});
