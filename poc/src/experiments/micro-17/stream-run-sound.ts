import {micro10AudioEventsBetween, type Micro10AudioEvent} from '../micro-10/sound';
import {resolveClips, type Timing as Micro17Timing} from './timeline';

export type StreamRunWindow = {at: number; duration: number};
export type CloudWhooshKind = 'cloudIn' | 'cloudOut';
export type CloudWhooshWindows = {cloudIn?: StreamRunWindow; cloudOut?: StreamRunWindow};
export type DrawerOpeningEffect = 'bubblePair' | 'whistleWhoosh';
export type DotTwinkleCue = {at: number; noteIndex: number; pan: number; gain: number};
export type CameraMoveWindow = StreamRunWindow;
export type DirectionalWhooshWindow = StreamRunWindow & {direction: 'leftToRight' | 'rightToLeft'};
export type AgentWindowSoundTiming = {down: StreamRunWindow; up: StreamRunWindow; thockAt: number};
export type FlowDoorSoundTiming = {slide: StreamRunWindow; thockAt: number};
export const STREAM_RUN_FADE_DURATION = 3;
export const OPENING_CLOUD_PUFF_PAIR = Object.freeze({duration: .64, interval: .1});
const AUDIO_10_CADENCE = {puffOffset: .35, puffInterval: .7, tickOffset: .1, tickInterval: .35};
const rounded = (value: number) => Math.round(value * 1e9) / 1e9;

export function streamRunAudioEventsBetween(previousTime: number, currentTime: number, streamRun: StreamRunWindow, fadeDuration = STREAM_RUN_FADE_DURATION, puffOffset = AUDIO_10_CADENCE.puffOffset) {
  if (currentTime <= previousTime || !Number.isFinite(streamRun.at) || !Number.isFinite(streamRun.duration)
    || streamRun.duration <= 0 || !Number.isFinite(fadeDuration) || fadeDuration < 0) return [];
  const audibleDuration = streamRun.duration + fadeDuration;
  const events = micro10AudioEventsBetween(previousTime - streamRun.at, currentTime - streamRun.at, {
    duration: audibleDuration,
    ...AUDIO_10_CADENCE,
    puffOffset: Number.isFinite(puffOffset) ? Math.max(0, puffOffset) : AUDIO_10_CADENCE.puffOffset,
  });
  const tailEnd = streamRun.at + audibleDuration;
  return events.map((event): Micro10AudioEvent => ({...event, time: rounded(event.time + streamRun.at)}))
    .filter(event => event.time < tailEnd - 1e-9);
}

export function micro17CloudInWindow(timing: Micro17Timing): StreamRunWindow {
  const authored = timing.cloudEnter;
  const resolved = resolveClips(timing).find(clip => clip.key === 'cloudEnter')!;
  return {at: authored.at, duration: authored.duration === 0 ? 0 : resolved.duration};
}

export function cloudWhooshEventsBetween(previousTime: number, currentTime: number, windows: CloudWhooshWindows) {
  if (currentTime <= previousTime) return [];
  return (Object.entries(windows) as [CloudWhooshKind, StreamRunWindow | undefined][])
    .filter((entry): entry is [CloudWhooshKind, StreamRunWindow] => Boolean(entry[1]))
    .filter(([, window]) => previousTime < window.at && currentTime >= window.at)
    .map(([kind, window]) => ({kind, time: window.at, duration: window.duration}))
    .sort((a, b) => a.time - b.time);
}

export function openingCloudPuffEventsBetween(previousTime: number, currentTime: number, times: readonly number[]) {
  if (currentTime <= previousTime) return [];
  return times.filter(time => previousTime < time && currentTime >= time)
    .map(time => ({kind: 'cloudPuff' as const, time, duration: OPENING_CLOUD_PUFF_PAIR.duration}))
    .sort((a, b) => a.time - b.time);
}

export function dotTwinkleEventsBetween(previousTime: number, currentTime: number, cues: readonly DotTwinkleCue[]) {
  if (currentTime <= previousTime) return [];
  return cues.filter(cue => previousTime < cue.at && currentTime >= cue.at)
    .map(cue => ({...cue, kind: 'dotTwinkleShimmer' as const}));
}

export function flowRevealEventsBetween(previousTime: number, currentTime: number, window?: StreamRunWindow) {
  if (!window || currentTime <= previousTime || window.duration <= 0 || previousTime >= window.at || currentTime < window.at) return [];
  return [{kind: 'flowReveal' as const, time: window.at, duration: window.duration}];
}

export function numberDropEventsBetween(previousTime: number, currentTime: number, times: readonly number[]) {
  if (currentTime <= previousTime) return [];
  return times.filter(time => previousTime < time && currentTime >= time)
    .map(time => ({kind: 'numberDropPiano' as const, time}))
    .sort((a, b) => a.time - b.time);
}

export function flowRatchetEventsBetween(previousTime: number, currentTime: number, window: StreamRunWindow | undefined, interval: number) {
  if (!window || currentTime <= previousTime || window.duration <= 0 || !Number.isFinite(interval) || interval <= 0) return [];
  const end = window.at + window.duration;
  const first = Math.max(0, Math.floor((previousTime - window.at) / interval + 1e-9) + 1);
  const events: {kind: 'flowRatchet'; time: number}[] = [];
  for (let index = first; ; index++) {
    const time = rounded(window.at + index * interval);
    if (time > currentTime + 1e-9 || time >= end - 1e-9) break;
    if (time > previousTime + 1e-9) events.push({kind: 'flowRatchet', time});
  }
  return events;
}

export function agentWindowSoundEventsBetween(previousTime: number, currentTime: number, timing?: AgentWindowSoundTiming) {
  if (!timing || currentTime <= previousTime) return [];
  return [
    {kind: 'agentWindowDown' as const, time: timing.down.at},
    {kind: 'agentWindowThock' as const, time: timing.thockAt},
    {kind: 'agentWindowUp' as const, time: timing.up.at},
  ].filter(event => previousTime < event.time && currentTime >= event.time)
    .sort((a, b) => a.time - b.time);
}

export function flowDoorSoundEventsBetween(previousTime: number, currentTime: number, timing?: FlowDoorSoundTiming) {
  if (!timing || currentTime <= previousTime) return [];
  return [
    {kind: 'flowDoorSlide' as const, time: timing.slide.at},
    {kind: 'flowDoorThock' as const, time: timing.thockAt},
  ].filter(event => previousTime < event.time && currentTime >= event.time)
    .sort((a, b) => a.time - b.time);
}

export function cameraMoveEventsBetween(previousTime: number, currentTime: number, windows: readonly CameraMoveWindow[]) {
  if (currentTime <= previousTime) return [];
  return windows.filter(window => previousTime < window.at && currentTime >= window.at && window.duration > 0)
    .map(window => ({kind: 'cameraMove' as const, time: window.at, duration: window.duration}))
    .sort((a, b) => a.time - b.time);
}

export function directionalWhooshEventsBetween(previousTime: number, currentTime: number, windows: readonly DirectionalWhooshWindow[]) {
  if (currentTime <= previousTime) return [];
  return windows.filter(window => previousTime < window.at && currentTime >= window.at && window.duration > 0)
    .map(window => ({kind: window.direction === 'leftToRight' ? 'cheapWhooshLeftToRight' as const : 'cheapWhooshRightToLeft' as const, time: window.at, duration: window.duration}))
    .sort((a, b) => a.time - b.time);
}

export function drawerOpeningEventsBetween(previousTime: number, currentTime: number, times: readonly number[], effect: DrawerOpeningEffect) {
  if (currentTime <= previousTime) return [];
  const kind = effect === 'bubblePair' ? 'drawerBubble' as const : 'drawerWhoosh' as const;
  return times.filter(time => previousTime < time && currentTime >= time)
    .map(time => ({kind, time}))
    .sort((a, b) => a.time - b.time);
}

export function streamRunAudioStateAt(time: number, streamRun: StreamRunWindow, fadeDuration = STREAM_RUN_FADE_DURATION) {
  if (!Number.isFinite(time) || !Number.isFinite(streamRun.at) || !Number.isFinite(streamRun.duration)
    || streamRun.duration <= 0 || !Number.isFinite(fadeDuration) || fadeDuration < 0) return {phase: 'silent' as const, gain: 0};
  const end = streamRun.at + streamRun.duration;
  if (time < streamRun.at || fadeDuration === 0 && time >= end || time >= end + fadeDuration) return {phase: 'silent' as const, gain: 0};
  if (time < end) return {phase: 'active' as const, gain: 1};
  return {phase: 'fading' as const, gain: rounded(1 - (time - end) / fadeDuration)};
}
