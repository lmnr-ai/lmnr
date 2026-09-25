import assert from 'node:assert/strict';
import test from 'node:test';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {CLIP_KEYS as KEYS17} from '../micro-17/timeline';
import {CLIP_KEYS as KEYS16} from '../micro-16/timeline';
import {FLOW_CLIP_KEYS, INTRODUCING_FLOW_1_TIMELINE} from '../introducing-flow-1/timeline';
import {costTimelineConfig, liveFlowPreview, liveIssuesPreview, mergeTimelineTiming, timelinePreviewSignature, ultimate2TimelineConfig} from './authoring';
import {MICRO_15_SUBTITLE_KEYS, MICRO_15_TIMELINE} from '../micro-15/timeline';
import {sampleFlow} from './sample';
import {ULTIMATE_3_DEFAULTS, normalizeSettings} from './settings';

const liveTimeline = (config: Record<string, any>, time: number) => {
  const clips = computeStaticTimeline(parseTimelineConfig(config), {}).clips;
  return {time, ...Object.fromEntries(clips.map(clip => [clip.key, {...config[clip.key], current: (computeClipState(clip, time, time) as any).current}]))};
};

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

test('paused live Issues adapter reads subtitle clip.current and instant boundaries', () => {
  const settings=ULTIMATE_3_DEFAULTS; const leadEnd=settings.issues.leadIn.at+settings.issues.leadIn.duration;
  const keys=Object.keys(MICRO_15_TIMELINE);
  const config={leadIn:{at:0,duration:leadEnd,from:{progress:0},to:{progress:1}},...mergeTimelineTiming(MICRO_15_TIMELINE as any,settings.issues.timing,keys,leadEnd)};
  const timeline:any=liveTimeline(config,leadEnd+3.5);
  timeline.subtitleReady.current.progress=.37;
  assert.equal(liveIssuesPreview(timeline,settings).subtitles.subtitleReady,.37);
  for(const key of MICRO_15_SUBTITLE_KEYS) assert.equal(typeof timeline[key].current.progress,'number');
  const instant=normalizeSettings({...settings,issues:{...settings.issues,timing:{...settings.issues.timing,subtitleReady:{at:3,duration:0}}}});
  const instantTimeline:any=liveTimeline({...config,subtitleReady:{...(MICRO_15_TIMELINE as any).subtitleReady,at:leadEnd+3,duration:0}},leadEnd+3);
  instantTimeline.subtitleReady.current.progress=0;
  assert.equal(liveIssuesPreview(instantTimeline,instant).subtitles.subtitleReady,1);
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
