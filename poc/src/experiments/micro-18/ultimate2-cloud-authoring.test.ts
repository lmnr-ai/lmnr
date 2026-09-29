import assert from 'node:assert/strict';
import test from 'node:test';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {ULTIMATE2_CLOUD_KEY, ultimate2CloudTimelineConfig, ultimate2CloudTimelineValues, settingsFromUltimate2CloudTimeline} from './authoring';
import {VOICEOVER_DEFAULTS, readVoiceoverSettings} from './voiceover-cut';
import returnedSettings from '../../../handoff/voiceover-soak/default-settings.json';
import {VOICEOVER_PHRASES} from './voiceover-phrases';
import {normalizeSettings} from './settings';
import {sampleMicro17} from '../micro-17/sample';

const defaults = normalizeSettings(VOICEOVER_DEFAULTS);

test('pasted Main defaults apply exact cloud timing/easing and chapter rounding; narration only switches to the A/subtle take', () => {
  const previous = normalizeSettings(returnedSettings);
  const voiceover = {version: 1 as const, phrases: Object.fromEntries(VOICEOVER_PHRASES.map(p => [p.id, p.placed]))};
  const cloudEnter = {at: 12.49, duration: 6.17,
    transition: {type: 'easing' as const, duration: 6.17, ease: [.2, 0, .55, .2] as [number, number, number, number]}};
  const expected = normalizeSettings({...previous, allocations: {ultimate2: 22.41, cost: 13.7, flow: 15.192, issues: 19.308, conclusion: 6.55},
    ultimate2: {...previous.ultimate2, timing: {...previous.ultimate2.timing, cloudEnter}},
    // Subsequent user tuning halves the explanation typing, not its narration.
    issues: {...previous.issues, timing22: {...previous.issues.timing22, explanationTyping: {
      ...previous.issues.timing22!.explanationTyping, duration: 1.2,
      transition: {type: 'easing', duration: 1.2, ease: [.45, 0, .55, 1]},
    }}}, voiceover});
  assert.deepEqual(defaults, expected);
  assert.deepEqual(readVoiceoverSettings({getItem: () => null}), expected);
  assert.deepEqual(readVoiceoverSettings({getItem: () => JSON.stringify(returnedSettings)}), expected);
  assert.deepEqual(ultimate2CloudTimelineConfig(defaults)[ULTIMATE2_CLOUD_KEY], {...cloudEnter, from: {progress: 0}, to: {progress: 1}});
  assert.deepEqual(defaults.voiceover, voiceover);
  // Updating code defaults must not erase a saved manual tune.
  const custom = normalizeSettings({...expected, ultimate2: {...expected.ultimate2, timing: {...expected.ultimate2.timing,
    cloudEnter: {...cloudEnter, at: 14.25}}}});
  assert.deepEqual(readVoiceoverSettings({getItem: () => JSON.stringify(custom)}), custom);
});

test('Main cloud bar aliases the existing native clip without changing settings on mount', () => {
  const config = ultimate2CloudTimelineConfig(defaults);
  assert.equal(config[ULTIMATE2_CLOUD_KEY].at, defaults.ultimate2.timing.cloudEnter.at);
  assert.deepEqual(settingsFromUltimate2CloudTimeline(config, defaults), defaults);
  assert.equal(ultimate2CloudTimelineValues(defaults)[`${ULTIMATE2_CLOUD_KEY}.duration`], defaults.ultimate2.timing.cloudEnter.duration);
});

test('Main cloud edits persist only to Ultimate2 cloudEnter, retaining authored curves and native endpoints', () => {
  const cloud = {...ultimate2CloudTimelineConfig(defaults)[ULTIMATE2_CLOUD_KEY], at: 18.5, duration: 2,
    from: {progress: .1}, to: {progress: .9}, transition: {type: 'spring' as const, duration: .8, bounce: .1}};
  const changed = settingsFromUltimate2CloudTimeline({[ULTIMATE2_CLOUD_KEY]: cloud}, defaults);
  assert.deepEqual(changed.ultimate2.timing.cloudEnter, {at: 18.5, duration: 2, transition: cloud.transition});
  assert.deepEqual(ultimate2CloudTimelineConfig(changed)[ULTIMATE2_CLOUD_KEY].from, {progress: 0});
  assert.deepEqual(ultimate2CloudTimelineConfig(changed)[ULTIMATE2_CLOUD_KEY].to, {progress: 1});
  assert.deepEqual({...changed, ultimate2: {...changed.ultimate2, timing: {...changed.ultimate2.timing, cloudEnter: defaults.ultimate2.timing.cloudEnter}}}, defaults);
  const reloaded = normalizeSettings(JSON.parse(JSON.stringify(changed)));
  assert.deepEqual(settingsFromUltimate2CloudTimeline(ultimate2CloudTimelineConfig(reloaded), reloaded), changed);
  assert.equal(changed.ultimate2.timing.cloudEnter.transition?.duration, .8);
});

test('Main clip.current matches native/export cloud progress on forward and reverse seeks', () => {
  const settings = settingsFromUltimate2CloudTimeline({[ULTIMATE2_CLOUD_KEY]: {
    ...ultimate2CloudTimelineConfig(defaults)[ULTIMATE2_CLOUD_KEY], at: 18.5, duration: 2,
    transition: {type: 'easing', duration: 2, ease: [.2, 0, .8, 1]},
  }}, defaults);
  const clip = computeStaticTimeline(parseTimelineConfig(ultimate2CloudTimelineConfig(settings)), {}).clips[0];
  for (const time of [0, 18.5, 19.1, 20.5, 19.1, 18, 20.5]) {
    const current = (computeClipState(clip, time, time) as any).current.progress;
    assert.ok(Math.abs(current - sampleMicro17(time, settings.ultimate2.timing).progress.cloudEnter) < 1e-9);
  }
});

test('Cloud bar has a 50ms minimum without moving other tracks or allocations', () => {
  const settings = settingsFromUltimate2CloudTimeline({[ULTIMATE2_CLOUD_KEY]: {...ultimate2CloudTimelineConfig(defaults)[ULTIMATE2_CLOUD_KEY], duration: 0}}, defaults);
  assert.equal(settings.ultimate2.timing.cloudEnter.duration, .05);
  assert.deepEqual(settings.allocations, defaults.allocations);
});
