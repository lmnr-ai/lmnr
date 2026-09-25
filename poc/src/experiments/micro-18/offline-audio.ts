import {agentScreenPan, worldState as micro17WorldState} from '../micro-17/geometry';
import {sampleMicro17} from '../micro-17/sample';
import {Micro10AudioEngine} from '../micro-10/sound';
import {costClickTracks} from '../micro-16/cost-ratchet';
import {STREAM_RUN_FADE_DURATION, agentWindowSoundEventsBetween, cameraMoveEventsBetween, cloudWhooshEventsBetween, directionalWhooshEventsBetween, dotTwinkleEventsBetween, drawerOpeningEventsBetween, flowDoorSoundEventsBetween, flowRatchetEventsBetween, flowRevealEventsBetween, numberDropEventsBetween, openingCloudPuffEventsBetween, streamRunAudioEventsBetween} from '../micro-17/stream-run-sound';
import {RatchetClickEngine, clickEventsBetween, ultimate2ClickTracks, type ClickEvent, type ClickTrack} from '../ratchet-click';
import {chapterSchedule, ultimate3DurationFrames} from './sample';
import {normalizeSettings, ultimate2Endpoint, type Ultimate3Settings} from './settings';
import {flattenUltimate3SoundMix, normalizeUltimate3SoundMix, type Ultimate3SoundMix} from './sound-controls';
import {ultimate3AgentWindowSoundTiming, ultimate3CameraMoveWindows, ultimate3CheapAgentWhooshWindows, ultimate3CloudWhooshWindows, ultimate3DrawerOpeningTimes, ultimate3ErrorChimeTimes, ultimate3FlowDoorSoundTiming, ultimate3FlowNumberDropTimes, ultimate3FlowRatchetWindow, ultimate3FlowRevealWindow, ultimate3FlowTwinkleCues, ultimate3OpeningCloudPuffTimes} from './sound';
import {IssueTypingTickEngine, ultimate3TypingTickEvents} from './typing-audio';
import {ErrorChimeEngine} from './error-chime';
import {Ultimate3MusicEngine, ultimate3SangersMusicPlan} from './ultimate3-music';

export const ULTIMATE3_AUDIO_SAMPLE_RATE = 48_000;
export const ULTIMATE3_AUDIO_FPS = 30;
export type Ultimate3OfflineAudioReport = {
  sampleRate: number; audioFrames: number; videoFrames: number; duration: number; peak: number; rms: number;
  eventCounts: Record<string, number>;
};

const PCM_QUANTIZATION_STEPS = 100_000;
const quantizePcm = (sample: number) => {
  const quantized = Math.round(sample * PCM_QUANTIZATION_STEPS) / PCM_QUANTIZATION_STEPS;
  return Object.is(quantized, -0) ? 0 : quantized;
};

const seededRandom = (initial: number) => {
  let state = initial >>> 0;
  return () => { state = (state + 0x6d2b79f5) | 0; let value = Math.imul(state ^ state >>> 15, 1 | state); value ^= value + Math.imul(value ^ value >>> 7, 61 | value); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
};

function allClickEvents(tracks: readonly ClickTrack[], duration: number) {
  const events: ClickEvent[] = [];
  for (let at = 0; at < duration; at += .2) events.push(...clickEventsBetween(at - 1e-9, Math.min(duration, at + .2), tracks));
  return events;
}

/** Build every Ultimate 3 voice from the same schedules and synth engines as preview. */
export async function renderUltimate3OfflineAudio(settingsInput: Ultimate3Settings, mixInput: Ultimate3SoundMix | Record<string, unknown>) {
  const settings = normalizeSettings(settingsInput);
  const mix = normalizeUltimate3SoundMix('Shared' in mixInput ? flattenUltimate3SoundMix(mixInput) : mixInput);
  const frames = ultimate3DurationFrames(settings);
  const duration = frames / ULTIMATE3_AUDIO_FPS;
  const context = new OfflineAudioContext(2, Math.round(duration * ULTIMATE3_AUDIO_SAMPLE_RATE), ULTIMATE3_AUDIO_SAMPLE_RATE);
  const audioContext = context as unknown as AudioContext;
  const schedule = chapterSchedule(settings);
  const starts = Object.fromEntries(schedule.map(chapter => [chapter.id, chapter.start])) as Record<'ultimate2'|'cost'|'flow'|'issues'|'conclusion', number>;
  const stream = settings.ultimate2.timing.streamRun;
  const streamRun = {at: starts.ultimate2 + stream.at, duration: stream.duration};
  const streamEnd = starts.ultimate2 + Math.min(schedule[0].duration, ultimate2Endpoint(settings));
  const random = seededRandom(0x18a0d10);
  const effects = new Micro10AudioEngine({context: audioContext, random});
  await effects.enable();
  effects.setMasterGain(mix.masterVolume);
  effects.setMix({tickVolume: mix.tickVolume, puffVolume: mix.puffVolume, whooshVolume: mix.cloudVolume,
    drawerVolume: mix.drawerVolume, cameraVolume: mix.cameraVolume, cameraSound: mix.cameraSound, cameraDurationMultiplier: mix.cameraDurationMultiplier, flowRevealVolume: mix.flowRevealVolume,
    flowRevealTimeToPeak: mix.flowRevealTimeToPeak, flowRevealTail: mix.flowRevealTail,
    flowRatchetVolume: mix.flowRatchetVolume, twinkleVolume: mix.twinkleVolume,
    numberDropVolume: mix.numberDropVolume, numberDropBaseMidi: Number(mix.numberDropBase),
    agentWindowSlideVolume: mix.agentWindowSlideVolume, agentWindowClickVolume: mix.agentWindowClickVolume,
    droneVolume: 0});
  // Match preview's natural puff fade; streamEnd clips ratchets, not this envelope.
  effects.scheduleStreamEnvelope(streamRun.at, streamRun.at + streamRun.duration, streamRun.at + streamRun.duration + STREAM_RUN_FADE_DURATION);

  const eventCounts: Record<string, number> = {};
  const count = (kind: string) => { eventCounts[kind] = (eventCounts[kind] ?? 0) + 1; };
  for (const event of streamRunAudioEventsBetween(-1e-6, duration, streamRun, STREAM_RUN_FADE_DURATION, mix.puffOffset)) {
    if (event.kind === 'tick') continue;
    effects.playAt(event.kind, event.time); count(event.kind);
  }
  for (const event of cloudWhooshEventsBetween(-1e-6, duration, ultimate3CloudWhooshWindows(settings))) { effects.playAt(event.kind, event.time, event.duration); count(event.kind); }
  for (const event of openingCloudPuffEventsBetween(-1e-6, duration, ultimate3OpeningCloudPuffTimes(settings))) { effects.playAt(event.kind, event.time, event.duration); count(event.kind); }
  for (const event of drawerOpeningEventsBetween(-1e-6, duration, ultimate3DrawerOpeningTimes(settings), mix.drawerOpening)) { effects.playAt(event.kind, event.time); count(event.kind); }
  for (const event of cameraMoveEventsBetween(-1e-6, duration, ultimate3CameraMoveWindows(settings))) { effects.playAt(event.kind, event.time, event.duration); count(event.kind); }
  for (const event of directionalWhooshEventsBetween(-1e-6, duration, ultimate3CheapAgentWhooshWindows(settings))) { effects.playAt(event.kind, event.time, event.duration); count(event.kind); }
  const reveal = ultimate3FlowRevealWindow(settings, mix.flowRevealTimeToPeak + mix.flowRevealTail);
  for (const event of flowRevealEventsBetween(-1e-6, duration, reveal)) { effects.playAt(event.kind, event.time, event.duration); count(event.kind); }
  for (const event of flowRatchetEventsBetween(-1e-6, duration, ultimate3FlowRatchetWindow(settings), mix.flowRatchetInterval)) { effects.playAt(event.kind, event.time); count(event.kind); }
  for (const event of numberDropEventsBetween(-1e-6, duration, ultimate3FlowNumberDropTimes(settings))) { effects.playAt(event.kind, event.time); count(event.kind); }
  for (const event of dotTwinkleEventsBetween(-1e-6, duration, ultimate3FlowTwinkleCues(settings, mix.twinkleTimeToPeak, mix.twinkleTail, mix.twinkleDensity))) {
    effects.playDotTwinkleAt(event.noteIndex, event.pan, Number(mix.twinkleBase), event.gain, event.at + .005); count(event.kind);
  }
  for (const event of agentWindowSoundEventsBetween(-1e-6, duration, ultimate3AgentWindowSoundTiming(settings))) { effects.playAt(event.kind, event.time); count(event.kind); }
  for (const event of flowDoorSoundEventsBetween(-1e-6, duration, ultimate3FlowDoorSoundTiming(settings))) { effects.playAt(event.kind, event.time); count(event.kind); }

  const u2Tracks = ultimate2ClickTracks(streamRun, time => agentScreenPan(micro17WorldState(sampleMicro17(time - starts.ultimate2, settings.ultimate2.timing), settings.ultimate2.controls)), streamEnd, STREAM_RUN_FADE_DURATION);
  const u2Clicks = allClickEvents(u2Tracks, duration);
  const u2Engine = new RatchetClickEngine({context: audioContext}); await u2Engine.enable(); u2Engine.setVolume(mix.tickVolume * mix.masterVolume);
  for (const event of u2Clicks) u2Engine.playAt(event, event.time);
  eventCounts.ultimate2Ratchet = u2Clicks.length;

  const costClicks = allClickEvents(costClickTracks(settings.cost.timing, settings.cost.controls, starts.cost, settings.pacing.costTrimEnd), duration);
  const costEngine = new RatchetClickEngine({context: audioContext}); await costEngine.enable(); costEngine.setVolume(mix.costRatchetVolume * mix.masterVolume);
  for (const event of costClicks) costEngine.playAt(event, event.time);
  eventCounts.costRatchet = costClicks.length;

  const typing = new IssueTypingTickEngine({context: audioContext, random}); await typing.enable();
  typing.setMasterVolume(mix.masterVolume); typing.setTypingVolume(mix.typingVolume);
  const typingEvents = ultimate3TypingTickEvents(settings);
  for (const event of typingEvents) typing.scheduleAt(event.time);
  eventCounts.typingTick = typingEvents.length;

  const errorChime = new ErrorChimeEngine({context: audioContext}); await errorChime.enable();
  errorChime.setMasterVolume(mix.masterVolume); errorChime.setVolume(mix.errorToneVolume);
  const errorChimes = ultimate3ErrorChimeTimes(settings);
  for (const at of errorChimes) errorChime.playAt(at);
  eventCounts.errorChime = errorChimes.length;

  if (mix.musicVolume > 0) {
    const music = new Ultimate3MusicEngine({context: audioContext}); await music.enable();
    music.setVolume(mix.musicVolume); music.setMasterGain(mix.masterVolume);
    const plan = ultimate3SangersMusicPlan(settings); music.scheduleFrom(0, plan, starts, 0);
    eventCounts.music = plan.events.length;
  } else eventCounts.music = 0;

  const buffer = await context.startRendering();
  let peak = 0, sumSquares = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) { const data = buffer.getChannelData(channel); for (let frame = 0; frame < data.length; frame++) { const sample = quantizePcm(data[frame]); peak = Math.max(peak, Math.abs(sample)); sumSquares += sample * sample; } }
  const report: Ultimate3OfflineAudioReport = {sampleRate: buffer.sampleRate, audioFrames: buffer.length, videoFrames: frames, duration: buffer.duration, peak, rms: Math.sqrt(sumSquares / (buffer.length * buffer.numberOfChannels)), eventCounts};
  return {buffer, report, settings, mix};
}

/** IEEE float WAV preserves requested gains above unity without hidden normalization. */
export function audioBufferToFloatWav(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels, bytesPerSample = 4, dataBytes = buffer.length * channels * bytesPerSample;
  const bytes = new ArrayBuffer(44 + dataBytes), view = new DataView(bytes);
  const text = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 3, true); view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true); view.setUint16(32, channels * bytesPerSample, true); view.setUint16(34, 32, true);
  text(36, 'data'); view.setUint32(40, dataBytes, true);
  const channelData = Array.from({length: channels}, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  // Preserve output on a fixed -100 dB grid; seeded noise and event scheduling are deterministic.
  // Chrome oscillator/filter kernels can still differ by a few final float units across processes.
  for (let frame = 0; frame < buffer.length; frame++) for (let channel = 0; channel < channels; channel++, offset += 4) view.setFloat32(offset, quantizePcm(channelData[channel][frame]), true);
  return new Uint8Array(bytes);
}
