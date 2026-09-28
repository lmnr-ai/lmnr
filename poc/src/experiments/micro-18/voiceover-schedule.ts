import {ultimate3DurationFrames} from './sample';
import type {Ultimate3Settings} from './settings';
import {VOICEOVER_PHRASES} from './voiceover-phrases';

export const VOICEOVER_SR = 48000;
export const VOICEOVER_CALIBRATION = 1 / 6.98;
export const VOICEOVER_FADE = .015;
export type StereoPcm = {l: Float32Array; r: Float32Array};

export function voiceoverSchedule(settings: Ultimate3Settings) {
  const videoEnd = ultimate3DurationFrames(settings) / 30;
  return VOICEOVER_PHRASES.map(phrase => {
    const authored = settings.voiceover?.phrases[phrase.id] ?? {at: phrase.defaultAt, duration: phrase.b - phrase.a};
    const at = Math.min(videoEnd, Math.max(0, authored.at));
    const duration = Math.max(0, Math.min(phrase.b - phrase.a, authored.duration, videoEnd - at));
    return {...phrase, at, duration, end: at + duration, source: `${phrase.id}.wav`};
  }).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

/** Same edge gain in live source nodes and offline PCM. No speed change or time stretch. */
export function phraseGain(relative: number, duration: number) {
  if (duration <= 0 || relative < 0 || relative >= duration) return 0;
  return Math.max(0, Math.min(1, relative / VOICEOVER_FADE, (duration - relative) / VOICEOVER_FADE));
}

export function mixVoiceoverPcm(bed: StereoPcm, sources: Record<string, StereoPcm>, settings: Ultimate3Settings, master = 6.98): StereoPcm {
  const length = ultimate3DurationFrames(settings) * (VOICEOVER_SR / 30);
  const l = new Float32Array(length), r = new Float32Array(length);
  const add = (source: StereoPcm, index: number, frame: number, gain: number) => {
    l[frame] += source.l[index] * gain; r[frame] += source.r[index] * gain;
  };
  for (let n = 0; n < Math.min(length, bed.l.length, bed.r.length); n++) add(bed, n, n, 1);
  for (const phrase of voiceoverSchedule(settings)) {
    const source = sources[phrase.id];
    if (!source || phrase.duration === 0) continue;
    const start = Math.round(phrase.at * VOICEOVER_SR);
    const count = Math.min(Math.round(phrase.duration * VOICEOVER_SR), source.l.length, source.r.length, length - start);
    for (let n = 0; n < count; n++) add(source, n, start + n, phraseGain(n / VOICEOVER_SR, phrase.duration));
  }
  for (let n = 0; n < length; n++) { l[n] *= VOICEOVER_CALIBRATION * master; r[n] *= VOICEOVER_CALIBRATION * master; }
  return {l, r};
}
