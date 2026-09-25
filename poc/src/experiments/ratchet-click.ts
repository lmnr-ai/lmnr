export type RatchetClickPreset = {
  note: number; detune: number; speed: number; power: number; brightness: number; resonance: number;
  volume: number; clickLevel: number; clickTone: number; clickDecay: number; teeth: number;
};

/** Signal Lab's supplied preset, restricted to the transient-only parameters we use. */
export const SOFT_PAWL_CLICK = Object.freeze<RatchetClickPreset>({
  note: 55, detune: 0, speed: .16, power: .38, brightness: .3, resonance: 1.5,
  volume: .41, clickLevel: .25, clickTone: .25, clickDecay: 62, teeth: 3,
});
export const ULTIMATE2_CLICK = SOFT_PAWL_CLICK;
export const COST_YELLOW_CLICK = Object.freeze({...SOFT_PAWL_CLICK, note: 67, speed: .38});
export const COST_PURPLE_CLICK = Object.freeze({...SOFT_PAWL_CLICK, note: 43, speed: .10});
export const clickRate = (preset: RatchetClickPreset) => (1.5 + 10.5 * preset.speed) * preset.teeth;
export const midiFrequency = (note: number, detune = 0) => 440 * 2 ** ((note - 69 + detune / 100) / 12);

export type ClickTrack = {
  id: string; start: number; end: number; preset: RatchetClickPreset;
  rateScaleAt?: (time: number) => number; gainAt?: (time: number) => number; panAt?: (time: number) => number;
};
export type ClickEvent = {trackId: string; time: number; preset: RatchetClickPreset; gain: number; pan: number};
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

export function ultimate2ClickTracks(streamRun: {at: number; duration: number}, panAt?: (time: number) => number, trimEnd = Infinity, fadeDuration = 3): ClickTrack[] {
  if (!(streamRun.duration > 0)) return [];
  const activeEnd = streamRun.at + streamRun.duration;
  const end = Math.min(activeEnd + fadeDuration, trimEnd);
  if (!(end > streamRun.at)) return [];
  return [{id: 'ultimate2-stream', start: streamRun.at, end, preset: ULTIMATE2_CLICK,
    rateScaleAt: time => Math.min(1, clamp((time - streamRun.at) / .45), clamp((end - time) / .8)),
    gainAt: time => time < activeEnd ? 1 : fadeDuration > 0 ? clamp(1 - (time - activeEnd) / fadeDuration) : 0,
    panAt,
  }];
}

// A fixed absolute integration grid makes phase independent of RAF partitioning.
const STEP = 1 / 480;
export function clickPhaseAt(track: ClickTrack, time: number) {
  const end = Math.min(track.end, Math.max(track.start, time));
  if (end <= track.start) return 0;
  const rate = clickRate(track.preset); let phase = 0;
  for (let left = track.start; left < end - 1e-12; left += STEP) {
    const right = Math.min(end, left + STEP); const mid = (left + right) / 2;
    phase += rate * clamp(track.rateScaleAt?.(mid) ?? 1) * (right - left);
  }
  return phase;
}
function timeForPhase(track: ClickTrack, target: number, low: number, high: number) {
  for (let i = 0; i < 32; i++) { const mid = (low + high) / 2; if (clickPhaseAt(track, mid) < target) low = mid; else high = mid; }
  return high;
}
export function clickEventsBetween(previous: number, current: number, tracks: readonly ClickTrack[]): ClickEvent[] {
  if (!(current > previous) || current - previous > .25) return [];
  return tracks.flatMap(track => {
    const left = Math.max(previous, track.start), right = Math.min(current, track.end);
    if (!(right > left)) return [];
    const from = clickPhaseAt(track, left), to = clickPhaseAt(track, right); const events: ClickEvent[] = [];
    for (let tooth = Math.floor(from + 1e-9) + 1; tooth <= Math.floor(to + 1e-9); tooth++) {
      const time = timeForPhase(track, tooth, left, right);
      if (time > previous + 1e-8 && time <= current + 1e-8 && time < track.end - 1e-8) events.push({
        trackId: track.id, time, preset: track.preset, gain: clamp(track.gainAt?.(time) ?? 1), pan: clamp(track.panAt?.(time) ?? 0, -1, 1),
      });
    }
    return events;
  }).sort((a, b) => a.time - b.time || a.trackId.localeCompare(b.trackId));
}

/** Transient-only port of Signal Lab's ratchet strike. It creates no looping or sustained sources. */
export class RatchetClickEngine {
  private context?: AudioContext; private output?: GainNode; private sources = new Set<OscillatorNode>(); private volume = 1;
  private readonly externalOutput?: AudioNode;
  constructor(options: {context?: AudioContext; output?: AudioNode} = {}) { this.context = options.context; this.externalOutput = options.output; }
  async enable() {
    this.context ??= new AudioContext();
    if (!this.output) { this.output = this.context.createGain(); this.output.gain.value = this.volume; this.output.connect(this.externalOutput ?? this.context.destination); }
    if (typeof OfflineAudioContext === 'undefined' || !(this.context instanceof OfflineAudioContext)) await this.context.resume();
  }
  setVolume(value: number) { this.volume = Math.max(0, value); if (this.output) this.output.gain.value = this.volume; }
  play(event: ClickEvent) { this.playAt(event, this.context?.currentTime ?? 0); }
  /** Schedule the existing ratchet recipe on an explicit audio-clock time. */
  playAt(event: ClickEvent, at: number) {
    const ctx = this.context, output = this.output; if (!ctx || !output || event.gain <= 0) return;
    const p = event.preset, pitch = midiFrequency(p.note, p.detune);
    const strike = ctx.createOscillator(), envelope = ctx.createGain(), bandpass = ctx.createBiquadFilter(), lowpass = ctx.createBiquadFilter(), level = ctx.createGain(), pan = ctx.createStereoPanner();
    strike.type = 'sine'; strike.frequency.value = pitch * (1.4 + p.clickTone * 5);
    envelope.gain.setValueAtTime(.0001, at); envelope.gain.linearRampToValueAtTime(1, at + .0015); envelope.gain.exponentialRampToValueAtTime(.0001, at + p.clickDecay / 1000);
    bandpass.type = 'bandpass'; bandpass.frequency.value = strike.frequency.value; bandpass.Q.value = 1.2 + p.resonance * .35;
    lowpass.type = 'lowpass'; lowpass.frequency.value = Math.min(12000, Math.max(280, pitch * (2.2 + p.brightness * 13))); lowpass.Q.value = p.resonance;
    level.gain.value = p.clickLevel * .42 * p.volume * .3 * event.gain; pan.pan.value = event.pan * .85;
    strike.connect(envelope).connect(bandpass).connect(lowpass).connect(level).connect(pan).connect(output);
    this.sources.add(strike); strike.onended = () => { this.sources.delete(strike); strike.disconnect(); envelope.disconnect(); bandpass.disconnect(); lowpass.disconnect(); level.disconnect(); pan.disconnect(); };
    strike.start(at); strike.stop(at + p.clickDecay / 1000 + .004);
  }
  pause() { for (const source of this.sources) { try { source.stop(); } catch {} } this.sources.clear(); }
  dispose() { this.pause(); void this.context?.close(); this.context = undefined; this.output = undefined; }
}
