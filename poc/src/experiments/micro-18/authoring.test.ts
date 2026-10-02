import assert from 'node:assert/strict';
import test from 'node:test';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {CLIP_KEYS as KEYS17} from '../micro-17/timeline';
import {CLIP_KEYS as KEYS16} from '../micro-16/timeline';
import {FLOW_CLIP_KEYS, INTRODUCING_FLOW_1_TIMELINE} from '../introducing-flow-1/timeline';
import {CONCLUSION_TIMELINE_KEYS, conclusionTimelineConfig, conclusionTimelineValues, settingsFromConclusionTimeline, costTimelineConfig, issuesTimelineConfig, settingsFromIssuesTimeline, liveFlowPreview, liveIssuesPreview, mergeTimelineTiming, timelinePreviewSignature, ultimate2TimelineConfig} from './authoring';
import {MICRO_15_SUBTITLE_KEYS, MICRO_15_TIMELINE} from '../micro-15/timeline';
import {chapterSchedule, sampleUltimate3, sampleFlow, sampleIssues} from './sample';
import {ULTIMATE_3_DEFAULTS, normalizeSettings, issuePostludeOffset} from './settings';

const liveTimeline = (config: Record<string, any>, time: number) => {
  const clips = computeStaticTimeline(parseTimelineConfig(config), {}).clips;
  return {time, ...Object.fromEntries(clips.map(clip => [clip.key, {...config[clip.key], current: (computeClipState(clip, time, time) as any).current}]))};
};

test('Conclusion opening preserves imported full clips and implicit defaults without writing settings', () => {
  const custom = normalizeSettings({...ULTIMATE_3_DEFAULTS, conclusion: {
    placeholder: {at: .3, duration: 2.5, from: {progress: .15}, to: {progress: .5},
      transition: {type: 'easing', duration: 2.5, ease: [.2, .1, .8, .9]}},
    logo: {at: 2.8, duration: 2, transition: {type: 'spring', bounce: .1}},
  }});
  for (const settings of [normalizeSettings(ULTIMATE_3_DEFAULTS), custom]) {
    const config = conclusionTimelineConfig(settings);
    const values = conclusionTimelineValues(settings);
    assert.deepEqual(values['placeholder.from.progress'], config.placeholder.from?.progress);
    assert.deepEqual(values['placeholder.to.progress'], config.placeholder.to?.progress);
    assert.deepEqual(values['placeholder.transition'], config.placeholder.transition);
    const opened = settingsFromConclusionTimeline(liveTimeline(config, 1), settings);
    assert.deepEqual(opened, settings);
    const reloaded = normalizeSettings(JSON.parse(JSON.stringify(opened)));
    assert.deepEqual(settingsFromConclusionTimeline(liveTimeline(conclusionTimelineConfig(reloaded), 1), reloaded), settings);
    const start = chapterSchedule(settings)[4].start;
    for (const t of [0, .4, 1, 2.79]) {
      assert.deepEqual(sampleUltimate3(start + t, opened), sampleUltimate3(start + t, settings));
    }
  }
});

test('Conclusion retiming and transition-only edits survive persistence and retain camera endpoints', () => {
  const settings = normalizeSettings({...ULTIMATE_3_DEFAULTS, conclusion: {
    placeholder: {at: 0, duration: 2, from: {progress: .1}, to: {progress: .5},
      transition: {type: 'easing', duration: 2, ease: [.2, 0, .8, 1]}},
    logo: ULTIMATE_3_DEFAULTS.conclusion.logo,
  }});
  const timeline: any = liveTimeline(conclusionTimelineConfig(settings), 1);
  const before = timelinePreviewSignature(timeline, CONCLUSION_TIMELINE_KEYS);
  timeline.placeholder.transition = {type: 'spring', visualDuration: 1.2, bounce: .15};
  assert.notEqual(timelinePreviewSignature(timeline, CONCLUSION_TIMELINE_KEYS), before);
  const transitionEdit = settingsFromConclusionTimeline(timeline, settings);
  assert.deepEqual(transitionEdit.conclusion.placeholder.transition, timeline.placeholder.transition);
  timeline.placeholder.at = .5;
  timeline.placeholder.duration = 3;
  const retimed = settingsFromConclusionTimeline(timeline, transitionEdit);
  assert.equal(retimed.conclusion.logo.at, 3.5);
  assert.deepEqual(retimed.conclusion.placeholder.from, {progress: .1});
  assert.deepEqual(retimed.conclusion.placeholder.to, {progress: .5});
  const reloaded = normalizeSettings(JSON.parse(JSON.stringify(retimed)));
  assert.deepEqual(settingsFromConclusionTimeline(liveTimeline(conclusionTimelineConfig(reloaded), 3), reloaded), retimed);
  const endpoint = sampleUltimate3(chapterSchedule(reloaded)[4].start + 3.49, reloaded);
  assert.ok(Math.abs(endpoint.conclusionSource!.outro!.scale - .7) < .001);
  const signature = timelinePreviewSignature(timeline, CONCLUSION_TIMELINE_KEYS);
  timeline.placeholder.to = {progress: .6};
  assert.notEqual(timelinePreviewSignature(timeline, CONCLUSION_TIMELINE_KEYS), signature);
  assert.deepEqual(settingsFromConclusionTimeline(timeline, reloaded).conclusion.placeholder.to, {progress: .6});
});

test('Conclusion retiming leaves implicit transition duration coupled to the new clip duration', () => {
  const settings = normalizeSettings(ULTIMATE_3_DEFAULTS);
  const timeline: any = liveTimeline(conclusionTimelineConfig(settings), 1);
  timeline.placeholder.duration = 3;
  const retimed = settingsFromConclusionTimeline(timeline, settings);
  assert.equal(retimed.conclusion.placeholder.transition, undefined);
  const transition = conclusionTimelineConfig(retimed).placeholder.transition!;
  assert.equal(transition.type, 'easing');
  if (transition.type === 'easing') assert.equal(transition.duration, 3);
  assert.equal(retimed.conclusion.logo.at, 3);
});

test('17 and 16 detail configs preserve complete source clips required by DialKit current progress', () => {
  for (const [merged, keys] of [
    [ultimate2TimelineConfig(ULTIMATE_3_DEFAULTS), KEYS17],
    [costTimelineConfig(ULTIMATE_3_DEFAULTS), KEYS16],
  ] as const) {
    const clips:any = merged;
    for (const key of keys) {
      assert.deepEqual(clips[key].from, {progress: 0});
      assert.deepEqual(clips[key].to, {progress: 1});
    }
    const live:any = liveTimeline(clips, .5);
    for (const key of keys) assert.equal(typeof live[key].current.progress, 'number');
  }
});

test('paused preview signature changes for timing and current edits without a seek', () => {
  const timeline:any = {time:.5, firstThinking:{at:.23,duration:.7,transition:{type:'easing'},current:{progress:.5}}};
  const before=timelinePreviewSignature(timeline,['firstThinking']);
  timeline.firstThinking.at=.6; timeline.firstThinking.current.progress=0;
  assert.notEqual(timelinePreviewSignature(timeline,['firstThinking']),before);
  assert.equal(timeline.time,.5);
});

test('Issues authoring uses the same full source20 evaluator, including paused endpoints and instant bars', () => {
  const settings = normalizeSettings(ULTIMATE_3_DEFAULTS);
  const offset = issuePostludeOffset(settings), time = offset + 4;
  const timeline: any = liveTimeline(issuesTimelineConfig(settings), time);
  assert.deepEqual(liveIssuesPreview(timeline, settings), sampleIssues(time, settings).source20);
  timeline.postlude_subtitleReady.from = {progress: .27};
  timeline.postlude_subtitleReady.to = {progress: .8};
  timeline.postlude_subtitleReady.duration = 0;
  timeline.postlude_subtitleReady.at = time;
  const authored = settingsFromIssuesTimeline(timeline, settings);
  assert.equal(authored.issues.timing.subtitleReady.from?.progress, .27);
  assert.equal(authored.issues.timing.subtitleReady.to?.progress, .8);
  const sampled = liveIssuesPreview(timeline, settings);
  assert.equal(sampled.phase, 'issues');
  assert.equal(sampled.issue?.subtitles.subtitleReady, .8);
});

test('paused live Flow adapter matches the pure/export sampler, including retiming and instant clips', () => {
  const settings=normalizeSettings({...ULTIMATE_3_DEFAULTS,flow:{...ULTIMATE_3_DEFAULTS.flow,entrySlide:{...ULTIMATE_3_DEFAULTS.flow.entrySlide,duration:.8},timing:{...ULTIMATE_3_DEFAULTS.flow.timing,cameraZoom:{...ULTIMATE_3_DEFAULTS.flow.timing.cameraZoom,at:1.4,duration:0}}}});
  const entryEnd=settings.flow.entrySlide.at+settings.flow.entrySlide.duration;
  const keys=FLOW_CLIP_KEYS.filter(key=>key!=='cloudReveal');
  const config={entrySlide:{at:settings.flow.entrySlide.at,duration:settings.flow.entrySlide.duration,from:{progress:0},to:{progress:1},transition:settings.flow.entrySlide.transition},...mergeTimelineTiming(INTRODUCING_FLOW_1_TIMELINE,settings.flow.timing,keys,entryEnd)};
  for(const localTime of [.4,.8,2.19,2.2]) {
    const live=liveTimeline(config,localTime);
    assert.deepEqual(liveFlowPreview(live,settings),sampleFlow(localTime,settings));
  }
});
