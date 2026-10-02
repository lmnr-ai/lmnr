import {useEffect, useMemo, useRef} from 'react';
import {useAutomaticAudio} from '../automatic-audio';
import type {Ultimate3Settings} from './settings';
import {ultimate3ErrorChimeTimes} from './sound';

export const ERROR_CHIME_PATH = '/audio/error-chime/error-chime.wav';
export const ERROR_CHIME_MASTER_REFERENCE = 6.98;
const LOOKAHEAD = .08;

/** Raw mastered WAVs use unity at the production master setting, unlike quiet synthesized voices. */
export const errorChimeMasterGain = (masterVolume: number) =>
  Math.max(0, Number.isFinite(masterVolume) ? masterVolume / ERROR_CHIME_MASTER_REFERENCE : 0);

type ErrorChimeEngineOptions = {context?: AudioContext; output?: AudioNode};

/** Plays the exact soundboard error-chime sample through independently adjustable gains. */
export class ErrorChimeEngine {
  private context?: AudioContext;
  private output?: GainNode;
  private level?: GainNode;
  private buffer?: AudioBuffer;
  private loading?: Promise<void>;
  private sources = new Set<AudioBufferSourceNode>();
  private masterVolume = 1;
  private volume = 1;
  private readonly externalOutput?: AudioNode;
  private readonly ownsContext: boolean;

  constructor(options: ErrorChimeEngineOptions = {}) {
    this.context = options.context;
    this.externalOutput = options.output;
    this.ownsContext = !options.context;
  }

  async enable() {
    this.context ??= new AudioContext();
    if (!this.output) {
      this.output = this.context.createGain();
      this.level = this.context.createGain();
      this.level.connect(this.output);
      this.output.connect(this.externalOutput ?? this.context.destination);
    }
    this.output.gain.setValueAtTime(this.masterVolume, this.context.currentTime);
    this.level!.gain.setValueAtTime(this.volume, this.context.currentTime);
    this.loading ??= fetch(ERROR_CHIME_PATH).then(async response => {
      if (!response.ok) throw new Error(`Unable to load error chime: ${ERROR_CHIME_PATH}`);
      this.buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
    });
    await this.loading;
    if (typeof OfflineAudioContext === 'undefined' || !(this.context instanceof OfflineAudioContext)) await this.context.resume();
  }

  setMasterVolume(value: number) {
    this.masterVolume = errorChimeMasterGain(value);
    if (this.output && this.context) this.output.gain.setTargetAtTime(this.masterVolume, this.context.currentTime, .015);
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Number.isFinite(value) ? value : 0);
    if (this.level && this.context) this.level.gain.setTargetAtTime(this.volume, this.context.currentTime, .015);
  }

  playAt(at: number) {
    if (!this.context || !this.level || !this.buffer) return;
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.level);
    source.onended = () => { this.sources.delete(source); source.disconnect(); };
    this.sources.add(source);
    source.start(Math.max(this.context.currentTime, at));
  }

  playIn(delay: number) {
    if (this.context) this.playAt(this.context.currentTime + Math.max(0, delay));
  }

  pause() {
    for (const source of this.sources) { try { source.stop(); } catch {} }
    this.sources.clear();
  }

  dispose() {
    this.pause();
    if (this.ownsContext) void this.context?.close();
    this.context = undefined;
    this.output = undefined;
    this.level = undefined;
    this.buffer = undefined;
  }
}

/** Schedule only imminent cues; skipped or reverse-seek cues never replay. */
export function errorChimeFrameEvents(through: number, time: number, cues: readonly number[]) {
  return cues.filter(cue => cue > Math.max(through, time) && cue <= time + LOOKAHEAD);
}

export function useUltimate3ErrorChime(time: number, playing: boolean, settings: Ultimate3Settings, volume: number, masterVolume: number) {
  const cues = useMemo(() => ultimate3ErrorChimeTimes(settings), [settings]);
  const signature = cues.join('|');
  const engine = useRef<ErrorChimeEngine | null>(null);
  engine.current ??= new ErrorChimeEngine();
  const ready = useAutomaticAudio(engine.current, playing);
  const state = useRef({time, through: time, signature, active: false});

  useEffect(() => () => engine.current?.dispose(), []);
  useEffect(() => engine.current?.setMasterVolume(masterVolume), [masterVolume]);
  useEffect(() => engine.current?.setVolume(volume), [volume]);
  useEffect(() => {
    const previous = state.current.time;
    const discontinuity = time < previous || time - previous > .25 || state.current.signature !== signature;
    state.current.time = time;
    state.current.signature = signature;
    if (!playing || ready === 0) {
      engine.current?.pause(); state.current.through = time; state.current.active = false; return;
    }
    if (discontinuity) {
      engine.current?.pause(); state.current.through = time; state.current.active = true; return;
    }
    if (state.current.active && time > state.current.through) {
      engine.current?.pause(); state.current.through = time;
    }
    if (!state.current.active) state.current.through = time;
    state.current.active = true;
    for (const cue of errorChimeFrameEvents(state.current.through, time, cues)) engine.current?.playIn(cue - time);
    state.current.through = Math.max(state.current.through, time + LOOKAHEAD);
  }, [cues, playing, ready, signature, time]);
}
