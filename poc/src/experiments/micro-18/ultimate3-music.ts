import {chapterSchedule} from './sample';
import type {Ultimate3Settings} from './settings';

export type MusicVoice = 'melody' | 'harmony' | 'motion' | 'finale';
export type MusicEvent = {at: number; duration: number; notes: readonly number[]; voice: MusicVoice; gain: number};
export type Ultimate3MusicPlan = {events: MusicEvent[]; logoAt: number; secondsPerBeat: number; finalNoteAt: number; end: number};

type BeatNote = {pitch: number | null; beats: number};
type BeatChord = {notes: readonly number[]; beats: number};
const n = (pitch: number | null, beats: number): BeatNote => ({pitch, beats});

/** Schubert, Sängers Morgenlied D.163 — the sourced 42-beat vocal line used by Song Studio. */
export const SANGERS_MORGENLIED_MELODY: readonly BeatNote[] = [
  n(79,1),n(74,.5),n(71,1),n(67,.5),n(72,.75),n(74,.25),n(76,.5),n(73,1),n(74,.5),n(79,.25),n(78,.25),n(76,.25),n(74,.25),n(72,.25),n(71,.25),
  n(69,1),n(72,.5),n(76,.25),n(74,.25),n(73,.25),n(74,.25),n(72,.25),n(69,.25),n(74,1.5),n(null,.5),n(75,1),n(76,1.375),n(78,.125),
  n(79,1),n(73,.5),n(74,3),n(75,1.5),n(74,1.5),n(73,1.5),n(null,.5),n(74,1),n(76,1.5),n(74,1.5),n(73,1.5),
  n(81,.25),n(79,.25),n(78,.25),n(76,.25),n(74,.25),n(72,.25),n(71,1),n(74,.5),n(69,1),n(74,.5),n(71,1),n(null,.5),
  n(78,.25),n(79,.25),n(81,.25),n(78,.25),n(74,.25),n(72,.25),n(71,1),n(74,.5),n(69,1),n(76,.25),n(74,.25),n(67,1),n(null,.5),
];

export const SANGERS_MORGENLIED_CHORDS: readonly BeatChord[] = [
  {notes:[43,47,50],beats:3},{notes:[50,54,57],beats:3},{notes:[43,47,50],beats:3},{notes:[48,52,55],beats:3},
  {notes:[45,48,52],beats:3},{notes:[50,54,57],beats:3},{notes:[43,47,50],beats:3},{notes:[43,47,50],beats:3},
  {notes:[48,52,55],beats:3},{notes:[50,54,57],beats:3},{notes:[43,47,50],beats:3},{notes:[50,54,57],beats:3},
  {notes:[43,47,50],beats:3},{notes:[43,47,50],beats:3},
];

const round = (value: number) => Math.round(value * 1e9) / 1e9;

function appendMelody(events: MusicEvent[], source: readonly BeatNote[], startBeat: number, maxBeats: number, secondsPerBeat: number) {
  let beat = 0;
  for (const item of source) {
    if (beat >= maxBeats) break;
    const duration = Math.min(item.beats, maxBeats - beat);
    if (item.pitch !== null) events.push({at: round((startBeat + beat) * secondsPerBeat), duration: duration * secondsPerBeat * .9, notes: [item.pitch], voice: 'melody', gain: 1});
    beat += item.beats;
  }
}

function appendHarmony(events: MusicEvent[], source: readonly BeatChord[], startBeat: number, maxBeats: number, secondsPerBeat: number) {
  let beat = 0;
  for (const item of source) {
    if (beat >= maxBeats) break;
    const duration = Math.min(item.beats, maxBeats - beat);
    events.push({at: round((startBeat + beat) * secondsPerBeat), duration: duration * secondsPerBeat, notes: item.notes, voice: 'harmony', gain: 1});
    beat += item.beats;
  }
}

/**
 * Two authored statements fill the film without time-stretching audio. The first
 * uses Schubert's complete 42-beat line; a 34-beat reprise changes orchestration,
 * then the supplied G-major cadence begins with the conclusion and lands on G
 * exactly at the editable Laminar-logo cut (beat 79).
 */
export function ultimate3SangersMusicPlan(settings: Ultimate3Settings): Ultimate3MusicPlan {
  const schedule = chapterSchedule(settings);
  const conclusion = schedule.find(chapter => chapter.id === 'conclusion')!;
  const logoAt = round(conclusion.start + settings.conclusion.logo.at);
  const finalNoteBeat = 79;
  const secondsPerBeat = logoAt / finalNoteBeat;
  const events: MusicEvent[] = [];

  appendMelody(events, SANGERS_MORGENLIED_MELODY, 0, 42, secondsPerBeat);
  appendHarmony(events, SANGERS_MORGENLIED_CHORDS, 0, 42, secondsPerBeat);
  appendMelody(events, SANGERS_MORGENLIED_MELODY, 42, 34, secondsPerBeat);
  appendHarmony(events, SANGERS_MORGENLIED_CHORDS, 42, 33, secondsPerBeat);
  events.push({at: round(75 * secondsPerBeat), duration: secondsPerBeat, notes: [50,54,57], voice: 'harmony', gain: .82});

  const cadence = [{pitch:69, beat:76, duration:1},{pitch:71, beat:77, duration:1},{pitch:66, beat:78, duration:1},{pitch:67, beat:79, duration:5}] as const;
  for (const note of cadence) events.push({at: round(note.beat * secondsPerBeat), duration: note.duration * secondsPerBeat, notes:[note.pitch], voice: note.beat === finalNoteBeat ? 'finale' : 'melody', gain: note.beat === finalNoteBeat ? 1.12 : .82});
  events.push({at: round(76 * secondsPerBeat), duration: 3 * secondsPerBeat, notes:[50,54,57], voice:'harmony', gain:.72});
  events.push({at: logoAt, duration: 5 * secondsPerBeat, notes:[43,47,50,55], voice:'finale', gain:.9});

  // Authored motion only in the middle acts: restrained roots in Cost and
  // glass overtones in Flow. Issues and the conclusion deliberately clear out.
  const cost = schedule.find(chapter => chapter.id === 'cost')!;
  const flow = schedule.find(chapter => chapter.id === 'flow')!;
  for (const chord of events.filter(event => event.voice === 'harmony')) {
    if (chord.at >= cost.start && chord.at < flow.start) events.push({at:chord.at,duration:Math.min(.42,chord.duration),notes:[chord.notes[0] - 12],voice:'motion',gain:.38});
    if (chord.at >= flow.start && chord.at < flow.start + flow.duration) events.push({at:chord.at,duration:Math.min(.32,chord.duration),notes:[chord.notes.at(-1)! + 12],voice:'motion',gain:.24});
  }

  return {events: events.sort((a,b) => a.at - b.at || a.voice.localeCompare(b.voice)), logoAt, secondsPerBeat, finalNoteAt: logoAt, end: round(84 * secondsPerBeat)};
}

const midiToFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class Ultimate3MusicEngine {
  private ctx?: AudioContext;
  private master?: GainNode;
  private compressor?: DynamicsCompressorNode;
  private sources: AudioScheduledSourceNode[] = [];
  private volume = .18;
  private masterGain = 1;
  private readonly externalOutput?: AudioNode;

  constructor(options: {context?: AudioContext; output?: AudioNode} = {}) { this.ctx = options.context; this.externalOutput = options.output; }

  async enable() {
    this.ctx ??= new AudioContext();
    if (!this.master) {
      this.master = this.ctx.createGain();
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -20;
      this.compressor.ratio.value = 2.5;
      this.master.connect(this.compressor).connect(this.externalOutput ?? this.ctx.destination);
    }
    this.master.gain.setValueAtTime(this.volume * this.masterGain, this.ctx.currentTime);
    if (typeof OfflineAudioContext === 'undefined' || !(this.ctx instanceof OfflineAudioContext)) await this.ctx.resume();
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1.5, Number.isFinite(volume) ? volume : 0));
    this.updateOutputGain();
  }

  setMasterGain(masterGain: number) {
    this.masterGain = Math.max(0, Number.isFinite(masterGain) ? masterGain : 0);
    this.updateOutputGain();
  }

  private updateOutputGain() {
    if (!this.master || !this.ctx) return;
    const value = this.volume * this.masterGain;
    if (typeof OfflineAudioContext !== 'undefined' && this.ctx instanceof OfflineAudioContext) this.master.gain.setValueAtTime(value, this.ctx.currentTime);
    else this.master.gain.setTargetAtTime(value, this.ctx.currentTime, .03);
  }

  pause() {
    for (const source of this.sources) try { source.stop(); } catch {}
    this.sources = [];
  }

  playFrom(videoTime: number, plan: Ultimate3MusicPlan, chapterStarts: {cost:number; flow:number; issues:number; conclusion:number}) {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
    this.pause();
    this.scheduleFrom(videoTime, plan, chapterStarts, this.ctx.currentTime + .035);
  }

  /** Schedule the unchanged arrangement on an explicit audio-clock origin. */
  scheduleFrom(videoTime: number, plan: Ultimate3MusicPlan, chapterStarts: {cost:number; flow:number; issues:number; conclusion:number}, now = 0) {
    if (!this.ctx || !this.master) return;
    for (const event of plan.events) {
      const end = event.at + event.duration;
      if (end <= videoTime || event.at >= plan.end) continue;
      const at = now + Math.max(0, event.at - videoTime);
      const duration = Math.max(.06, end - Math.max(videoTime, event.at));
      const phase = event.at < chapterStarts.cost ? 'opening' : event.at < chapterStarts.flow ? 'cost' : event.at < chapterStarts.issues ? 'flow' : event.at < chapterStarts.conclusion ? 'issues' : 'conclusion';
      if (event.voice === 'harmony' || (event.voice === 'finale' && event.notes.length > 1)) this.pad(event.notes, at, duration, event.gain * (phase === 'issues' ? .48 : .72));
      else if (event.voice === 'motion') this.bell(event.notes[0], at, duration, event.gain);
      else {
        this.piano(event.notes[0], at, duration, event.gain * (phase === 'issues' ? .62 : phase === 'flow' ? .88 : .76));
        if (phase === 'flow' && event.voice === 'melody') this.string(event.notes[0] - 12, at, duration, event.gain * .22);
      }
    }
  }

  private connectPan(pan = 0) {
    const panner = this.ctx!.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.master!);
    return panner;
  }

  private piano(pitch: number, at: number, duration: number, velocity: number) {
    const out = this.connectPan(((pitch % 7) - 3) * .035);
    for (let harmonic = 1; harmonic <= 4; harmonic++) {
      const oscillator = this.ctx!.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = midiToFrequency(pitch) * harmonic * (1 + harmonic * harmonic * .0003);
      const gain = this.ctx!.createGain();
      const peak = velocity * .075 * .55 ** (harmonic - 1) / Math.sqrt(harmonic);
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), at + .018);
      gain.gain.exponentialRampToValueAtTime(.0001, at + Math.min(duration + .7, 2.4));
      oscillator.connect(gain).connect(out);
      oscillator.start(at); oscillator.stop(at + Math.min(duration + .75, 2.45));
      this.sources.push(oscillator);
    }
  }

  private pad(notes: readonly number[], at: number, duration: number, velocity: number) {
    notes.forEach((pitch, index) => {
      const oscillator = this.ctx!.createOscillator(); oscillator.type = 'triangle'; oscillator.frequency.value = midiToFrequency(pitch);
      const gain = this.ctx!.createGain(); const attack = Math.min(.22, duration * .25); const release = Math.min(.5, duration * .3);
      gain.gain.setValueAtTime(.0001, at); gain.gain.linearRampToValueAtTime(velocity * .025 / Math.sqrt(notes.length), at + attack);
      gain.gain.setValueAtTime(velocity * .025 / Math.sqrt(notes.length), at + Math.max(attack, duration - release));
      gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
      oscillator.connect(gain).connect(this.connectPan((index - (notes.length - 1) / 2) * .12));
      oscillator.start(at); oscillator.stop(at + duration + .04); this.sources.push(oscillator);
    });
  }

  private string(pitch: number, at: number, duration: number, velocity: number) {
    const oscillator = this.ctx!.createOscillator(); oscillator.type = 'triangle'; oscillator.frequency.value = midiToFrequency(pitch);
    const filter = this.ctx!.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1800;
    const gain = this.ctx!.createGain(); gain.gain.setValueAtTime(.0001, at); gain.gain.linearRampToValueAtTime(velocity * .035, at + Math.min(.12,duration*.3)); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(filter).connect(gain).connect(this.connectPan(-.12)); oscillator.start(at); oscillator.stop(at + duration + .04); this.sources.push(oscillator);
  }

  private bell(pitch: number, at: number, duration: number, velocity: number) {
    [1,2.01,3.98].forEach((ratio,index) => {
      const oscillator = this.ctx!.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = midiToFrequency(pitch) * ratio;
      const gain = this.ctx!.createGain(); const release = Math.min(.8, duration + .35);
      gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(velocity * .035 / (index + 1), at + .008); gain.gain.exponentialRampToValueAtTime(.0001, at + release);
      oscillator.connect(gain).connect(this.connectPan(index === 1 ? .2 : -.12)); oscillator.start(at); oscillator.stop(at + release + .04); this.sources.push(oscillator);
    });
  }
}
