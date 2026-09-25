import {computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {resolveMicro16Clips} from '../micro-16/timeline';
import {resolveClips as resolveMicro17Clips} from '../micro-17/timeline';
import {micro17CloudInWindow, type AgentWindowSoundTiming, type CameraMoveWindow, type CloudWhooshWindows, type DirectionalWhooshWindow, type DotTwinkleCue, type FlowDoorSoundTiming} from '../micro-17/stream-run-sound';
import {chapterSchedule} from './sample';
import type {ClipTiming, Ultimate3Settings} from './settings';

const resolvedDuration = (timing: ClipTiming) => {
  if (timing.duration === 0) return 0;
  const config = {camera: {at: timing.at, duration: timing.duration, from: {progress: 0}, to: {progress: 1}, transition: timing.transition}};
  return computeStaticTimeline(parseTimelineConfig(config), {}).clips[0].duration;
};

export function ultimate3CameraMoveWindows(settings: Ultimate3Settings): CameraMoveWindow[] {
  const schedule = chapterSchedule(settings);
  const ultimate2Start = schedule.find(chapter => chapter.id === 'ultimate2')!.start;
  const costStart = schedule.find(chapter => chapter.id === 'cost')!.start;
  const flowStart = schedule.find(chapter => chapter.id === 'flow')!.start;
  const u2Zoom = settings.ultimate2.timing.finalZoom;
  const u2Resolved = resolveMicro17Clips(settings.ultimate2.timing).find(clip => clip.key === 'finalZoom')!;
  const costKeys = ['cameraDownToBash', 'cameraDownToBudget'] as const;
  const costResolved = resolveMicro16Clips(settings.cost.timing);
  const flowEntry = settings.flow.entrySlide;
  const flowNativeStart = flowStart + flowEntry.at + flowEntry.duration;
  const flowKeys = ['cameraZoom', 'cameraToBenchmark', 'cameraToAnalysis', 'cameraToEngine'] as const;
  return [
    {at: ultimate2Start + u2Zoom.at, duration: u2Zoom.duration === 0 ? 0 : u2Resolved.duration},
    ...costKeys.map(key => {
      const timing = settings.cost.timing[key];
      const resolved = costResolved.find(clip => clip.key === key)!;
      return {at: costStart + timing.at, duration: timing.duration === 0 ? 0 : resolved.duration};
    }),
    {at: flowStart + flowEntry.at, duration: resolvedDuration(flowEntry)},
    ...flowKeys.map(key => ({at: flowNativeStart + settings.flow.timing[key].at, duration: resolvedDuration(settings.flow.timing[key])})),
  ].sort((a, b) => a.at - b.at);
}

export function ultimate3CheapAgentWhooshWindows(settings: Ultimate3Settings): DirectionalWhooshWindow[] {
  const costStart = chapterSchedule(settings).find(chapter => chapter.id === 'cost')!.start;
  const keys = ['cheapLegOneRight', 'cheapLegTwoLeft', 'cheapLegThreeRight'] as const;
  const resolved = resolveMicro16Clips(settings.cost.timing);
  return keys.map((key, index) => ({
    at: costStart + settings.cost.timing[key].at,
    duration: settings.cost.timing[key].duration === 0 ? 0 : resolved.find(clip => clip.key === key)!.duration,
    direction: index === 1 ? 'rightToLeft' as const : 'leftToRight' as const,
  }));
}

const twinkleRandom = (index: number, channel: number) => {
  let value = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
};

export function ultimate3FlowTwinkleCues(settings: Ultimate3Settings, timeToPeak = .8, tail = 6, peakDensity = 7): DotTwinkleCue[] {
  const flow = chapterSchedule(settings).find(chapter => chapter.id === 'flow')!;
  const rise = Math.max(.05, timeToPeak);
  const fall = Math.max(.05, tail);
  const duration = rise + fall;
  const step = .05;
  const cues: DotTwinkleCue[] = [];
  for (let index = 1; index * step < duration; index++) {
    const elapsed = index * step;
    const density = elapsed <= rise ? elapsed / rise : 1 - (elapsed - rise) / fall;
    if (twinkleRandom(index, 0) >= Math.max(0, peakDensity) * step * Math.max(0, density)) continue;
    cues.push({
      at: Math.round((flow.start + elapsed + (twinkleRandom(index, 1) - .5) * step * .6) * 1e9) / 1e9,
      noteIndex: Math.floor(twinkleRandom(index, 2) * 3),
      pan: twinkleRandom(index, 3) * 1.6 - .8,
      gain: Math.pow(Math.max(0, density), 1.5),
    });
  }
  return cues.sort((a, b) => a.at - b.at);
}

export function ultimate3FlowRevealWindow(settings: Ultimate3Settings, duration = settings.flow.timing.cameraToBenchmark.at): CameraMoveWindow {
  const flow = chapterSchedule(settings).find(chapter => chapter.id === 'flow')!;
  return {at: flow.start, duration};
}

export function ultimate3FlowNumberDropTimes(settings: Ultimate3Settings) {
  const flow = chapterSchedule(settings).find(chapter => chapter.id === 'flow')!;
  const nativeStart = flow.start + settings.flow.entrySlide.at + settings.flow.entrySlide.duration;
  const firstDrop = nativeStart + settings.flow.timing.modelRows.at;
  return Array.from({length: 6}, (_, rowIndex) =>
    Math.round((firstDrop + rowIndex * settings.flow.controls.numberRowStagger) * 1e9) / 1e9);
}

export function ultimate3FlowRatchetWindow(settings: Ultimate3Settings): CameraMoveWindow {
  const flow = chapterSchedule(settings).find(chapter => chapter.id === 'flow')!;
  const entryEnd = settings.flow.entrySlide.at + settings.flow.entrySlide.duration;
  const barsGrow = settings.flow.timing.barsGrow;
  return {
    at: flow.start + entryEnd + barsGrow.at,
    duration: resolvedDuration(barsGrow),
  };
}

export function ultimate3FlowDoorSoundTiming(settings: Ultimate3Settings): FlowDoorSoundTiming {
  const flowStart = chapterSchedule(settings).find(chapter => chapter.id === 'flow')!.start;
  const nativeStart = flowStart + settings.flow.entrySlide.at + settings.flow.entrySlide.duration;
  const cover = settings.flow.timing.coverDescent;
  const rounded = (value: number) => Math.round(value * 1e9) / 1e9;
  return {
    slide: {at: rounded(nativeStart + cover.at), duration: .57},
    thockAt: rounded(nativeStart + cover.at + cover.duration - .05),
  };
}

export function ultimate3AgentWindowSoundTiming(settings: Ultimate3Settings): AgentWindowSoundTiming {
  const issuesStart = chapterSchedule(settings).find(chapter => chapter.id === 'issues')!.start;
  const nativeStart = issuesStart + settings.issues.leadIn.at + settings.issues.leadIn.duration;
  const enter = settings.issues.timing.agentWindowEnter;
  const exit = settings.issues.timing.agentWindowExit;
  const rounded = (value: number) => Math.round(value * 1e9) / 1e9;
  return {
    down: {at: rounded(nativeStart + enter.at), duration: .57},
    thockAt: rounded(nativeStart + enter.at + enter.duration - .05),
    up: {at: rounded(nativeStart + exit.at), duration: .57},
  };
}

export function ultimate3OpeningCloudPuffTimes(settings: Ultimate3Settings) {
  const ultimate2Start = chapterSchedule(settings).find(chapter => chapter.id === 'ultimate2')!.start;
  const firstCloudAt = ultimate2Start + settings.ultimate2.timing.firstThinking.at;
  return [firstCloudAt, firstCloudAt + .1];
}

export function ultimate3ErrorChimeTimes(settings: Ultimate3Settings) {
  const schedule = chapterSchedule(settings);
  const ultimate2Start = schedule.find(chapter => chapter.id === 'ultimate2')!.start;
  const costStart = schedule.find(chapter => chapter.id === 'cost')!.start;
  return [
    ultimate2Start + settings.ultimate2.timing.warningEnter.at,
    costStart + settings.cost.timing.bashWarning.at,
  ].map(time => Math.round(time * 1e9) / 1e9);
}

export function ultimate3DrawerOpeningTimes(settings: Ultimate3Settings) {
  const schedule = chapterSchedule(settings);
  const ultimate2Start = schedule.find(chapter => chapter.id === 'ultimate2')!.start;
  const costStart = schedule.find(chapter => chapter.id === 'cost')!.start;
  const ultimate2 = settings.ultimate2.timing;
  const cost = settings.cost.timing;
  return [
    ultimate2Start + ultimate2.redThinkingLift.at,
    ultimate2Start + ultimate2.readLift.at,
    ultimate2Start + ultimate2.thinkingLift.at,
    costStart + cost.thinkingDrop.at,
    costStart + cost.bashExpand.at,
  ].sort((a, b) => a - b);
}

export function ultimate3CloudWhooshWindows(settings: Ultimate3Settings): CloudWhooshWindows {
  const schedule = chapterSchedule(settings);
  const ultimate2 = schedule.find(chapter => chapter.id === 'ultimate2')!;
  const cost = schedule.find(chapter => chapter.id === 'cost')!;
  const cloudIn = micro17CloudInWindow(settings.ultimate2.timing);
  const authoredOut = settings.cost.timing.cloudSweep;
  const resolvedOut = resolveMicro16Clips(settings.cost.timing).find(clip => clip.key === 'cloudSweep')!;
  return {
    cloudIn: {at: ultimate2.start + cloudIn.at, duration: cloudIn.duration},
    cloudOut: {at: cost.start + authoredOut.at, duration: authoredOut.duration === 0 ? 0 : resolvedOut.duration},
  };
}
