import {useEffect, useMemo, useRef} from 'react';
import {useAutomaticAudio} from '../automatic-audio';
import type {Micro15Timing} from '../micro-15/timeline';
import {chapterSchedule, issueHandoffValidation} from './sample';
import {issuePostludeOffset, type Ultimate3Settings} from './settings';
import {renderThockKeystroke, THOCK_SAMPLE_RATE} from './thock-typing';

export type TypingTickEvent = Readonly<{time: number; voice?: number}>;
const rounded = (value: number) => Math.round(value * 1e9) / 1e9;
const end = (clip: {at: number; duration: number}) => clip.at + clip.duration;

// Keep the tuned cadence; only the keyboard timbre changes.
const TYPING_INTERVALS = [.12, .15, .115, .17, .13, .16];

/** Visible source20 postlude windows, clipped to the chapter and merged once for live/score callers. */
export function ultimate3TypingWindows(settings: Ultimate3Settings) {
  if (issueHandoffValidation(settings)) return [];
  const issues = chapterSchedule(settings).find(chapter => chapter.id === 'issues')!;
  const nativeStart = issues.start + issuePostludeOffset(settings);
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
  return merged;
}

/** Merge overlapping typing clips so simultaneous reveals don't double the cadence. */
export function ultimate3TypingTickEvents(settings: Ultimate3Settings): TypingTickEvent[] {
  const merged = ultimate3TypingWindows(settings);
  const events: TypingTickEvent[] = [];
  let nextAllowed = -Infinity;
  let beat = 0;
  for (const window of merged) {
    for (let time = Math.max(window.start + .02, nextAllowed); time < window.end; time = nextAllowed) {
      events.push({time: rounded(time), voice: beat});
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

type ActiveTick = {source: AudioBufferSourceNode; level: GainNode};

/** Legacy engine name retained for callers; voices are now stereo mechanical
 * thocks. Both live and offline paths schedule the same deterministic PCM.
 */
export class IssueTypingTickEngine {
  private context?: AudioContext;
  private output?: GainNode;
  private active = new Set<ActiveTick>();
  private buffers = new Map<number, AudioBuffer>();
  private master = 1;
  private volume = 1;
  private readonly externalOutput?: AudioNode;
  private readonly ownsContext: boolean;

  constructor(options: {context?: AudioContext; output?: AudioNode} = {}) {
    this.context = options.context; this.externalOutput = options.output; this.ownsContext = !options.context;
  }

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

  playAt(delay: number, voice = 0) {
    this.scheduleAt((this.context?.currentTime ?? 0) + Math.max(.01, Number.isFinite(delay) ? delay : 0), voice);
  }

  scheduleAt(now: number, identity = 0) {
    const ctx = this.context, output = this.output;
    if (!ctx || !output) return;
    let buffer = this.buffers.get(identity);
    if (!buffer) {
      const pcm = renderThockKeystroke(identity);
      buffer = ctx.createBuffer(2, pcm.left.length, THOCK_SAMPLE_RATE);
      buffer.getChannelData(0).set(pcm.left); buffer.getChannelData(1).set(pcm.right);
      if (this.buffers.size >= 64) this.buffers.delete(this.buffers.keys().next().value!);
      this.buffers.set(identity, buffer);
    }
    const source = ctx.createBufferSource(); source.buffer = buffer;
    const level = ctx.createGain(); level.gain.value = this.volume;
    source.connect(level).connect(output);
    const voice = {source, level}; this.active.add(voice);
    source.addEventListener('ended', () => {
      this.active.delete(voice); source.disconnect(); level.disconnect();
    }, {once: true});
    source.start(now);
  }

  pause() {
    for (const voice of this.active) {
      try { voice.source.stop(); } catch {}
      voice.source.disconnect(); voice.level.disconnect();
    }
    this.active.clear();
  }

  dispose() {
    this.pause(); this.buffers.clear(); this.output?.disconnect();
    if (this.ownsContext) void this.context?.close();
    this.context = undefined; this.output = undefined;
  }
}

const LOOKAHEAD = .08;

/** Never replay characters missed during a delayed frame or a forward seek. */
export function typingFrameEvents(through: number, time: number, events: readonly TypingTickEvent[]) {
  return typingTickEventsBetween(Math.max(through, time), time + LOOKAHEAD, events);
}

export function useIssueTypingAudio(time: number, playing: boolean, settings: Ultimate3Settings, typingVolume: number, masterVolume: number) {
  const events = useMemo(() => ultimate3TypingTickEvents(settings), [settings]);
  const signature = useMemo(() => events.map(event => `${event.time}:${event.voice}`).join('|'), [events]);
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
      engine.current?.playAt(event.time - time, event.voice);
    }
    state.current.through = Math.max(state.current.through, horizon);
  }, [events, playing, ready, signature, time]);
}
