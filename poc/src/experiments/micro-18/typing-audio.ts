import {useEffect, useMemo, useRef} from 'react';
import {useAutomaticAudio} from '../automatic-audio';
import type {Micro15Timing} from '../micro-15/timeline';
import {chapterSchedule} from './sample';
import type {Ultimate3Settings} from './settings';

/** Exact Signal Lab `tick` beep supplied for Issue clusters 2 typing. */
export const ISSUE_TYPING_TICK = Object.freeze({
  schema: 'signal-lab/v1', type: 'beep', name: 'tick', parameters: Object.freeze({
    wave: 'sine', startFreq: 3557, noise: 0, click: 1, body: 0,
    endFreq: 3708, duration: .04, attack: .009, bodyPitch: 230,
    bodyDecay: .16, filter: 1937, resonance: 1, distortion: 0,
    pan: 0, delay: 0, feedback: 0,
  }),
});

export type TypingTickEvent = Readonly<{time: number}>;
const rounded = (value: number) => Math.round(value * 1e9) / 1e9;
const end = (clip: {at: number; duration: number}) => clip.at + clip.duration;

// A repeatable, lightly varied human typing rhythm, independent of text length.
const TYPING_INTERVALS = [.12, .15, .115, .17, .13, .16];

/** Merge overlapping typing clips so simultaneous reveals don't double the cadence. */
export function ultimate3TypingTickEvents(settings: Ultimate3Settings): TypingTickEvent[] {
  const issues = chapterSchedule(settings).find(chapter => chapter.id === 'issues')!;
  const nativeStart = issues.start + settings.issues.leadIn.at + settings.issues.leadIn.duration;
  const timing: Micro15Timing = settings.issues.timing;
  const sendEnd = end(timing.messageSend);
  const afterSend = (clip: {at: number; duration: number}) => ({...clip, at: Math.max(clip.at, sendEnd)});
  const windows = [timing.promptTyping, timing.issueTyping, afterSend(timing.cliCommandTyping),
    afterSend(timing.sqlQueryTyping), afterSend(timing.sqlPredicateTyping)]
    .filter(clip => clip.duration > 0)
    .map(clip => ({start: Math.max(issues.start, nativeStart + clip.at), end: Math.min(issues.end, nativeStart + end(clip))}))
    .filter(window => window.end > window.start)
    .sort((a, b) => a.start - b.start);
  const merged: {start: number; end: number}[] = [];
  for (const window of windows) {
    const previous = merged[merged.length - 1];
    if (previous && window.start <= previous.end) previous.end = Math.max(previous.end, window.end);
    else merged.push({...window});
  }
  const events: TypingTickEvent[] = [];
  let nextAllowed = -Infinity;
  let beat = 0;
  for (const window of merged) {
    for (let time = Math.max(window.start + .02, nextAllowed); time < window.end; time = nextAllowed) {
      events.push({time: rounded(time)});
      nextAllowed = time + TYPING_INTERVALS[beat++ % TYPING_INTERVALS.length];
    }
  }
  return events;
}

export function typingTickEventsBetween(previous: number, current: number, events: readonly TypingTickEvent[]) {
  if (!(current > previous)) return [];
  return events.filter(event => event.time > previous + 1e-9 && event.time <= current + 1e-9);
}

export const isTypingTransportDiscontinuity = (previous: number, current: number) =>
  current < previous || current - previous > .25;

function whiteNoise(ctx: AudioContext, seconds: number, random = Math.random) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index++) data[index] = random() * 2 - 1;
  return buffer;
}

function pinkNoise(ctx: AudioContext, seconds: number, random = Math.random) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let index = 0; index < data.length; index++) {
    const white = random() * 2 - 1;
    b0 = .99886 * b0 + white * .0555179; b1 = .99332 * b1 + white * .0750759;
    b2 = .969 * b2 + white * .153852; b3 = .8665 * b3 + white * .3104856;
    b4 = .55 * b4 + white * .5329522; b5 = -.7616 * b5 - white * .016898;
    data[index] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * .5362) * .11;
    b6 = white * .115926;
  }
  return buffer;
}

export function beepDistortionCurve(amount: number) {
  const curve = new Float32Array(256); const k = amount * 3;
  for (let index = 0; index < curve.length; index++) {
    const x = index * 2 / curve.length - 1;
    curve[index] = (1 + k) * x / (1 + k * Math.abs(x));
  }
  return curve;
}

type ActiveTick = {sources: AudioScheduledSourceNode[]; level: GainNode};

/** A scoped port of Signal Lab playBeep, retaining all four sources and dry/delay graph. */
export class IssueTypingTickEngine {
  private context?: AudioContext;
  private output?: GainNode;
  private active = new Set<ActiveTick>();
  private master = 1;
  private volume = 1;
  private readonly externalOutput?: AudioNode;
  private readonly random: () => number;

  constructor(options: {context?: AudioContext; output?: AudioNode; random?: () => number} = {}) { this.context = options.context; this.externalOutput = options.output; this.random = options.random ?? Math.random; }

  async enable() {
    this.context ??= new AudioContext();
    if (!this.output) {
      this.output = this.context.createGain();
      this.output.gain.value = this.master;
      this.output.connect(this.externalOutput ?? this.context.destination);
    }
    if (typeof OfflineAudioContext === 'undefined' || !(this.context instanceof OfflineAudioContext)) await this.context.resume();
  }

  setMasterVolume(value: number) {
    this.master = Math.max(0, Number.isFinite(value) ? value : 0);
    if (this.output) this.output.gain.value = this.master;
  }

  setTypingVolume(value: number) {
    this.volume = Math.max(0, Number.isFinite(value) ? value : 0);
    for (const voice of this.active) voice.level.gain.value = this.volume;
  }

  playAt(delay: number) { this.scheduleAt((this.context?.currentTime ?? 0) + Math.max(.01, Number.isFinite(delay) ? delay : 0)); }

  /** Schedule the exact typing tick recipe at an absolute audio-clock time. */
  scheduleAt(now: number) {
    const ctx = this.context, output = this.output;
    if (!ctx || !output) return;
    const settings = ISSUE_TYPING_TICK.parameters;
    const finish = now + settings.duration;
    const oscillator = ctx.createOscillator();
    oscillator.type = settings.wave;
    oscillator.frequency.setValueAtTime(settings.startFreq, now);
    oscillator.frequency.exponentialRampToValueAtTime(settings.endFreq, finish);
    const toneLevel = ctx.createGain(); toneLevel.gain.value = .55;
    const noise = ctx.createBufferSource(); noise.buffer = whiteNoise(ctx, settings.duration + .02, this.random);
    const noiseLevel = ctx.createGain(); noiseLevel.gain.value = settings.noise;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(.0001, now);
    envelope.gain.exponentialRampToValueAtTime(1, now + Math.min(settings.attack, settings.duration * .8));
    envelope.gain.exponentialRampToValueAtTime(.0001, finish);
    const bodyEnd = now + settings.bodyDecay;
    const body = ctx.createOscillator(); body.type = 'sine';
    body.frequency.setValueAtTime(settings.bodyPitch * 1.15, now);
    body.frequency.exponentialRampToValueAtTime(settings.bodyPitch * .82, bodyEnd);
    const bodyEnvelope = ctx.createGain();
    bodyEnvelope.gain.setValueAtTime(.0001, now);
    bodyEnvelope.gain.exponentialRampToValueAtTime(Math.max(.0001, settings.body * .72), now + .002);
    bodyEnvelope.gain.exponentialRampToValueAtTime(.0001, bodyEnd);
    const clickDuration = .028;
    const click = ctx.createBufferSource(); click.buffer = pinkNoise(ctx, clickDuration, this.random);
    const clickFilter = ctx.createBiquadFilter(); clickFilter.type = 'bandpass'; clickFilter.frequency.value = 1800; clickFilter.Q.value = .8;
    const clickEnvelope = ctx.createGain();
    clickEnvelope.gain.setValueAtTime(Math.max(.0001, settings.click * .45), now);
    clickEnvelope.gain.exponentialRampToValueAtTime(.0001, now + clickDuration);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = settings.filter; filter.Q.value = settings.resonance;
    const shaper = ctx.createWaveShaper(); shaper.curve = beepDistortionCurve(settings.distortion / 100); shaper.oversample = '2x';
    const pan = ctx.createStereoPanner(); pan.pan.value = settings.pan;
    const dry = ctx.createGain(); dry.gain.value = .7;
    const delayNode = ctx.createDelay(1); delayNode.delayTime.value = settings.delay;
    const feedback = ctx.createGain(); feedback.gain.value = settings.feedback;
    const wet = ctx.createGain(); wet.gain.value = settings.delay ? .35 : 0;
    const level = ctx.createGain(); level.gain.value = this.volume;
    oscillator.connect(toneLevel).connect(envelope); noise.connect(noiseLevel).connect(envelope);
    envelope.connect(filter); body.connect(bodyEnvelope).connect(filter);
    click.connect(clickFilter).connect(clickEnvelope).connect(filter);
    if (settings.distortion > 0) filter.connect(shaper).connect(pan);
    else filter.connect(pan);
    pan.connect(dry).connect(level).connect(output);
    pan.connect(delayNode).connect(wet).connect(level);
    delayNode.connect(feedback).connect(delayNode);
    const sources: AudioScheduledSourceNode[] = [oscillator, body, click, noise];
    const voice = {sources, level}; this.active.add(voice);
    body.addEventListener('ended', () => this.active.delete(voice), {once: true});
    oscillator.start(now); body.start(now); click.start(now); noise.start(now);
    oscillator.stop(finish + .02); body.stop(bodyEnd + .02); click.stop(now + clickDuration); noise.stop(finish + .02);
  }

  pause() {
    for (const voice of this.active) for (const source of voice.sources) { try { source.stop(); } catch {} }
    this.active.clear();
  }

  dispose() {
    this.pause(); void this.context?.close(); this.context = undefined; this.output = undefined;
  }
}

const LOOKAHEAD = .08;

/** Never replay characters missed during a delayed frame or a forward seek. */
export function typingFrameEvents(through: number, time: number, events: readonly TypingTickEvent[]) {
  return typingTickEventsBetween(Math.max(through, time), time + LOOKAHEAD, events);
}

export function useIssueTypingAudio(time: number, playing: boolean, settings: Ultimate3Settings, typingVolume: number, masterVolume: number) {
  const events = useMemo(() => ultimate3TypingTickEvents(settings), [settings]);
  const signature = useMemo(() => events.map(event => event.time).join('|'), [events]);
  const engine = useRef<IssueTypingTickEngine | null>(null);
  engine.current ??= new IssueTypingTickEngine();
  const ready = useAutomaticAudio(engine.current, playing);
  const state = useRef({time, through: time, signature, active: false});
  useEffect(() => () => engine.current?.dispose(), []);
  useEffect(() => engine.current?.setMasterVolume(masterVolume), [masterVolume]);
  useEffect(() => engine.current?.setTypingVolume(typingVolume), [typingVolume]);
  useEffect(() => {
    const before = state.current.time;
    const discontinuity = isTypingTransportDiscontinuity(before, time) || state.current.signature !== signature;
    state.current.time = time; state.current.signature = signature;
    if (!playing || ready === 0) {
      engine.current?.pause(); state.current.through = time; state.current.active = false; return;
    }
    if (discontinuity) {
      engine.current?.pause(); state.current.through = time; state.current.active = true; return;
    }
    // Once playback outruns our scheduled horizon, discard any stale tail and
    // resume from now. Never collapse overdue character events into one burst.
    if (state.current.active && time > state.current.through) {
      engine.current?.pause(); state.current.through = time;
    }
    if (!state.current.active) state.current.through = time;
    state.current.active = true;
    const horizon = time + LOOKAHEAD;
    for (const event of typingFrameEvents(state.current.through, time, events)) {
      engine.current?.playAt(event.time - time);
    }
    state.current.through = Math.max(state.current.through, horizon);
  }, [events, playing, ready, signature, time]);
}
