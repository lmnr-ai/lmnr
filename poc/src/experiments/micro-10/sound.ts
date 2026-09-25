export type Micro10AudioEvent = {kind: 'puff' | 'tick'; time: number};
export type Micro10AudioVoiceKind = Micro10AudioEvent['kind'] | 'cloudIn' | 'cloudOut' | 'cloudPuff' | 'drawerBubble' | 'drawerWhoosh' | 'cameraMove' | 'cheapWhooshLeftToRight' | 'cheapWhooshRightToLeft' | 'flowReveal' | 'flowRatchet' | 'dotTwinkleShimmer' | 'numberDropPiano' | 'agentWindowDown' | 'agentWindowUp' | 'agentWindowThock' | 'flowDoorSlide' | 'flowDoorThock';
export type Micro10AudioTiming = {
  duration: number;
  puffOffset: number;
  puffInterval: number;
  tickOffset: number;
  tickInterval: number;
};
export type Micro10AudioMix = {tickVolume: number; puffVolume: number; droneVolume: number; whooshVolume?: number; drawerVolume?: number; cameraVolume?: number; cameraSound?: 'procedural' | 'deepCamera'; cameraDurationMultiplier?: number; flowRevealVolume?: number; flowRevealTimeToPeak?: number; flowRevealTail?: number; flowRatchetVolume?: number; twinkleVolume?: number; numberDropVolume?: number; numberDropBaseMidi?: number; agentWindowSlideVolume?: number; agentWindowClickVolume?: number};

export const FLOW_NUMBER_DROP_PIANO = Object.freeze({
  root: 783.99, velocity: .4, detune: -1.3, hardness: .85, hammer: .06,
  attack: .004, decay: .3, brightness: 0, spread: .01, width: .04,
  reverb: .34, volume: .09,
});

export const flowNumberDropFrequency = (baseMidi = 79) =>
  FLOW_NUMBER_DROP_PIANO.root * 2 ** ((baseMidi - 79) / 12);

export const DOT_TWINKLE_SHIMMER = Object.freeze({
  intervals: [0, 4, 7], velocity: .12, detune: -1.3, hardness: .28,
  hammer: .08, attack: .004, decay: .22, brightness: .36, spread: .08,
  width: .05, reverb: .28, volume: .24,
});

export const AGENT_WINDOW_THOCK = Object.freeze({
  wave: 'sine', startFreq: 1161, noise: 0, click: 1, body: .28, endFreq: 1073,
  duration: .08, attack: .004, bodyPitch: 60, bodyDecay: .145, filter: 8000,
  resonance: 1, distortion: 0, pan: 0, delay: 0, feedback: 0,
});

export const FLOW_DOOR_THOCK = Object.freeze({
  wave: 'sine', startFreq: 1016, noise: .05, click: 1, body: .63, endFreq: 882,
  duration: .05, attack: .004, bodyPitch: 60, bodyDecay: .14, filter: 8000,
  resonance: 1, distortion: 0, pan: 0, delay: 0, feedback: 0,
});

export const AGENT_WINDOW_SLIDE = Object.freeze({
  noiseColor: 'pink', duration: .57, body: 0, filterMotion: 'sweep', startFreq: 1875,
  endFreq: 1254, resonance: 23.05, envelopeShape: 'swell', attack: .461,
  decayCurve: 6.2, gain: .505, peak: .85, sharpness: .7, distortion: 0,
  panStart: .01, panEnd: 0, delay: .03,
});

export const CAMERA_MOVE_WHOOSH = Object.freeze({
  noiseColor: 'brown', duration: .94, body: .08, filterMotion: 'static',
  startFreq: 996, endFreq: 794, resonance: 9.55, envelopeShape: 'swell',
  attack: .227, decayCurve: 1.2, gain: .505, peak: .52, sharpness: .7,
  distortion: 0, panStart: .03, panEnd: .07, delay: .03,
});

export const CAMERA_MOVE_SAMPLE_VARIANTS = Object.freeze([
  Object.freeze({duration: .51, path: '/audio/deep-camera-whoosh/510ms.wav'}),
  Object.freeze({duration: .66, path: '/audio/deep-camera-whoosh/660ms.wav'}),
  Object.freeze({duration: 1, path: '/audio/deep-camera-whoosh/1000ms.wav'}),
  Object.freeze({duration: 1.2, path: '/audio/deep-camera-whoosh/1200ms.wav'}),
  Object.freeze({duration: 1.3, path: '/audio/deep-camera-whoosh/1300ms.wav'}),
  Object.freeze({duration: 1.58, path: '/audio/deep-camera-whoosh/1580ms.wav'}),
  Object.freeze({duration: 2, path: '/audio/deep-camera-whoosh/2000ms.wav'}),
]);

export const CHEAP_AGENT_WHOOSH_SAMPLES = Object.freeze({
  cheapWhooshLeftToRight: '/audio/cheap-agent-whoosh/left-to-right-400ms.wav',
  cheapWhooshRightToLeft: '/audio/cheap-agent-whoosh/right-to-left-400ms.wav',
});

export const DRAWER_BUBBLE_PAIR = Object.freeze([
  Object.freeze({wave: 'sine', startFreq: 319, endFreq: 284, duration: .17, attack: .015, filter: 8000, resonance: 1, pan: .35, offset: 0}),
  Object.freeze({wave: 'sine', startFreq: 391, endFreq: 327, duration: .17, attack: .015, filter: 8000, resonance: 1, pan: .35, offset: .1}),
]);

export const DRAWER_WHISTLE_WHOOSH = Object.freeze({
  noiseColor: 'brown', duration: .25, body: .02, filterMotion: 'sweep',
  startFreq: 459, endFreq: 1053, resonance: 4.3, envelopeShape: 'swell',
  attack: .393, decayCurve: 6, gain: .505, peak: .24, sharpness: .7,
  distortion: 0, panStart: .18, panEnd: .13, delay: .03,
});

export const CLOUD_WHOOSH_IN = Object.freeze({
  noiseColor: 'brown', duration: 1.2, body: .03, filterMotion: 'static',
  startFreq: 453, endFreq: 879, resonance: 5.85, envelopeShape: 'exponential',
  attack: .219, decayCurve: .2, gain: .505, peak: .52, sharpness: .7,
  distortion: 0, panStart: .01, panEnd: 0, delay: .03,
});

export const LIGHT_CLOUD_PUFF = Object.freeze({
  noiseColor: 'pink', duration: .64, body: .27, filterMotion: 'sweep',
  startFreq: 1296, endFreq: 628, resonance: 5.25, envelopeShape: 'puff',
  attack: .045, decayCurve: 5.8, gain: .16, peak: .09, sharpness: .8,
  distortion: 0, panStart: -.05, panEnd: .05, delay: .02,
});

export const CLOUD_WHOOSH = Object.freeze({
  noiseColor: 'brown', duration: 1.2, body: .03, filterMotion: 'static',
  startFreq: 773, endFreq: 455, resonance: 5.85, envelopeShape: 'exponential',
  attack: .219, decayCurve: .2, gain: .505, peak: .52, sharpness: .7,
  distortion: 0, panStart: .01, panEnd: 0, delay: .03,
});

export const TICK = Object.freeze({
  wave: 'sine', startFreq: 3557, noise: 0, click: 1, body: 0,
  endFreq: 3708, duration: .04, attack: .009, bodyPitch: 230,
  bodyDecay: .16, filter: 1937, resonance: 1, distortion: 0,
  pan: 0, delay: 0, feedback: 0,
});

// Signal Garden's first C-Lydian Harmonic section: C3, G3, B3, D4, F#4.
export const FLOW_REVEAL_PAD = Object.freeze({
  notes: [48, 55, 59, 62, 66], gain: .024, wave: 'sine' as OscillatorType,
  timeToPeak: .32, tail: 1.81,
});

// Pixel Conveyor's first D-major harmony panel: D3, A3, D4, F#4.
export const PIXEL_CONVEYOR_DRONE = Object.freeze({
  notes: [50, 57, 62, 66], gain: .032, wave: 'sine' as OscillatorType, attack: .32,
});

const rounded = (value: number) => Math.round(value * 1e9) / 1e9;

function periodicEvents(kind: Micro10AudioEvent['kind'], offset: number, interval: number, from: number, to: number) {
  if (!Number.isFinite(interval) || interval <= 0 || to <= from) return [];
  const first = Math.floor((from - offset) / interval + 1e-9) + 1;
  const events: Micro10AudioEvent[] = [];
  for (let index = Math.max(0, first); ; index++) {
    const time = rounded(offset + index * interval);
    if (time > to + 1e-9) break;
    if (time > from + 1e-9) events.push({kind, time});
  }
  return events;
}

export function micro10AudioEventsBetween(from: number, to: number, timing: Micro10AudioTiming) {
  const end = Math.min(to, timing.duration);
  return [
    ...periodicEvents('puff', timing.puffOffset, timing.puffInterval, from, end),
    ...periodicEvents('tick', timing.tickOffset, timing.tickInterval, from, end),
  ].sort((a, b) => a.time - b.time || a.kind.localeCompare(b.kind));
}

const midiToFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function brownNoise(ctx: AudioContext, seconds: number, random = Math.random) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let index = 0; index < data.length; index++) {
    brown = (brown + .02 * (random() * 2 - 1)) / 1.02;
    data[index] = brown * 3.5;
  }
  return buffer;
}

function reverbImpulse(ctx: AudioContext, seconds = 2.8, random = Math.random) {
  const buffer = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index++) data[index] = (random() * 2 - 1) * (1 - index / data.length) ** 2.4;
  }
  return buffer;
}

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
    b0 = .99886 * b0 + white * .0555179;
    b1 = .99332 * b1 + white * .0750759;
    b2 = .969 * b2 + white * .153852;
    b3 = .8665 * b3 + white * .3104856;
    b4 = .55 * b4 + white * .5329522;
    b5 = -.7616 * b5 - white * .016898;
    data[index] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * .5362) * .11;
    b6 = white * .115926;
  }
  return buffer;
}

export type Micro10AudioEngineOptions = {context?: AudioContext; output?: AudioNode; random?: () => number};

export class Micro10AudioEngine {
  private ctx?: AudioContext;
  private output?: GainNode;
  private streamBus?: GainNode;
  private twinkleReverb?: ConvolverNode;
  private cameraMoveBuffers = new Map<number, AudioBuffer>();
  private cheapAgentWhooshBuffers = new Map<'cheapWhooshLeftToRight' | 'cheapWhooshRightToLeft', AudioBuffer>();
  private cameraMoveLoad?: Promise<void>;
  private mix: Micro10AudioMix = {tickVolume: 1, puffVolume: 1, droneVolume: 1};
  private masterGain = 1;
  private activeVoices = new Set<{kind: Micro10AudioVoiceKind; sources: AudioScheduledSourceNode[]; level: GainNode}>();
  private drone?: {oscillators: OscillatorNode[]; gains: GainNode[]; bus: GainNode};
  private readonly externalOutput?: AudioNode;
  private readonly random: () => number;

  constructor(options: Micro10AudioEngineOptions = {}) { this.ctx = options.context; this.externalOutput = options.output; this.random = options.random ?? Math.random; }

  async enable() {
    this.ctx ??= new AudioContext();
    if (!this.output) {
      this.output = this.ctx.createGain();
      this.output.connect(this.externalOutput ?? this.ctx.destination);
    }
    this.output.gain.setValueAtTime(this.masterGain, this.ctx.currentTime);
    if (!this.streamBus) {
      this.streamBus = this.ctx.createGain();
      this.streamBus.gain.value = 1;
      this.streamBus.connect(this.output);
    }
    if (typeof OfflineAudioContext === 'undefined' || !(this.ctx instanceof OfflineAudioContext)) await this.ctx.resume();
    this.cameraMoveLoad ??= Promise.all([
      ...CAMERA_MOVE_SAMPLE_VARIANTS.map(async variant => {
        const response = await fetch(variant.path);
        if (!response.ok) throw new Error(`Unable to load camera whoosh: ${variant.path}`);
        const buffer = await this.ctx!.decodeAudioData(await response.arrayBuffer());
        this.cameraMoveBuffers.set(variant.duration, buffer);
      }),
      ...Object.entries(CHEAP_AGENT_WHOOSH_SAMPLES).map(async ([kind, path]) => {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Unable to load agent whoosh: ${path}`);
        const buffer = await this.ctx!.decodeAudioData(await response.arrayBuffer());
        this.cheapAgentWhooshBuffers.set(kind as 'cheapWhooshLeftToRight' | 'cheapWhooshRightToLeft', buffer);
      }),
    ]).then(() => undefined);
    await this.cameraMoveLoad;
  }

  pause() {
    this.stopDrone();
    this.stopVoices(.025);
  }

  fadeOut(duration: number) {
    this.stopDrone();
    this.stopVoices(Math.max(.01, duration));
  }

  /** Sets only the tick/puff family envelope; per-sound mix levels remain independent. */
  setStreamGain(gain: number) {
    if (!this.ctx || !this.streamBus) return;
    const now = this.ctx.currentTime;
    this.streamBus.gain.cancelScheduledValues(now);
    this.streamBus.gain.setValueAtTime(Math.min(1, Math.max(0, Number.isFinite(gain) ? gain : 0)), now);
  }

  /** Audio-clock equivalent of preview's active then linear fade stream bus. */
  scheduleStreamEnvelope(start: number, activeEnd: number, tailEnd: number) {
    if (!this.streamBus) return;
    this.streamBus.gain.setValueAtTime(0, 0);
    this.streamBus.gain.setValueAtTime(1, Math.max(0, start));
    this.streamBus.gain.setValueAtTime(1, Math.max(start, activeEnd));
    this.streamBus.gain.linearRampToValueAtTime(0, Math.max(activeEnd, tailEnd));
  }

  silenceStream() {
    this.setStreamGain(0);
    this.stopVoices(.025, voice => voice.kind === 'tick' || voice.kind === 'puff');
  }

  disable() {
    this.pause();
    if (this.ctx && this.output) this.output.gain.setTargetAtTime(0, this.ctx.currentTime, .015);
  }

  /** Ultimate 3's composition-level gain; standalone engines remain unity by default. */
  setMasterGain(value: number) {
    this.masterGain = Math.max(0, Number.isFinite(value) ? value : 0);
    if (!this.ctx || !this.output) return;
    const now = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(now);
    if (typeof OfflineAudioContext !== 'undefined' && this.ctx instanceof OfflineAudioContext) this.output.gain.setValueAtTime(this.masterGain, now);
    else this.output.gain.setTargetAtTime(this.masterGain, now, .015);
  }

  setMix(mix: Micro10AudioMix) {
    this.mix = mix;
    if (!this.ctx) return;
    if (this.drone) this.drone.bus.gain.setTargetAtTime(mix.droneVolume, this.ctx.currentTime, .015);
    for (const voice of this.activeVoices) {
      const volume = voice.kind === 'puff' ? mix.puffVolume : voice.kind === 'tick' ? mix.tickVolume
        : voice.kind === 'flowRatchet' ? mix.flowRatchetVolume ?? mix.tickVolume
        : voice.kind === 'drawerBubble' || voice.kind === 'drawerWhoosh' ? mix.drawerVolume ?? 1
        : voice.kind === 'cameraMove' || voice.kind === 'cheapWhooshLeftToRight' || voice.kind === 'cheapWhooshRightToLeft' ? mix.cameraVolume ?? 1
        : voice.kind === 'flowReveal' ? mix.flowRevealVolume ?? 1
        : voice.kind === 'dotTwinkleShimmer' ? mix.twinkleVolume ?? 1
        : voice.kind === 'numberDropPiano' ? mix.numberDropVolume ?? 1
        : voice.kind === 'agentWindowDown' || voice.kind === 'agentWindowUp' || voice.kind === 'flowDoorSlide' ? mix.agentWindowSlideVolume ?? 1
        : voice.kind === 'agentWindowThock' || voice.kind === 'flowDoorThock' ? mix.agentWindowClickVolume ?? 1 : mix.whooshVolume ?? 1;
      voice.level.gain.setTargetAtTime(volume, this.ctx.currentTime, .015);
    }
  }

  play(kind: Micro10AudioVoiceKind, duration?: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.playAt(kind, this.ctx.currentTime, duration);
  }

  /** Schedule against the supplied audio clock; used unchanged by offline exports. */
  playAt(kind: Micro10AudioVoiceKind, at: number, duration?: number) {
    if (!this.ctx || !this.output) return;
    if (kind === 'puff') this.playPuff(this.ctx, this.streamBus ?? this.output, at);
    else if (kind === 'tick') this.playTick(this.ctx, this.streamBus ?? this.output, kind, at);
    else if (kind === 'flowRatchet') this.playTick(this.ctx, this.output, kind, at);
    else if (kind === 'numberDropPiano') this.playNumberDropPiano(this.ctx, this.output, at);
    else if (kind === 'drawerBubble') this.playDrawerBubble(this.ctx, this.output, at);
    else if (kind === 'drawerWhoosh') this.playDrawerWhoosh(this.ctx, this.output, at);
    else if (kind === 'cameraMove' && duration && duration > 0) this.playCameraMove(this.ctx, this.output, duration * (this.mix.cameraDurationMultiplier ?? 1), at);
    else if ((kind === 'cheapWhooshLeftToRight' || kind === 'cheapWhooshRightToLeft') && duration && duration > 0) this.playCheapAgentWhoosh(this.ctx, this.output, kind, duration, at);
    else if (kind === 'flowReveal' && duration && duration > 0) this.playFlowReveal(this.ctx, this.output, duration, at);
    else if (kind === 'agentWindowDown' || kind === 'agentWindowUp' || kind === 'flowDoorSlide') this.playAgentWindowSlide(this.ctx, this.output, kind, at);
    else if (kind === 'agentWindowThock' || kind === 'flowDoorThock') this.playAgentWindowThock(this.ctx, this.output, kind, at);
    else if ((kind === 'cloudIn' || kind === 'cloudOut' || kind === 'cloudPuff') && duration && duration > 0) this.playCloudWhoosh(this.ctx, this.output, kind, duration, at);
  }

  private playAgentWindowSlide(ctx: AudioContext, output: AudioNode, kind: 'agentWindowDown' | 'agentWindowUp' | 'flowDoorSlide', at: number) {
    const recipe = AGENT_WINDOW_SLIDE;
    const now = at;
    const end = now + recipe.duration;
    const source = ctx.createBufferSource();
    source.buffer = pinkNoise(ctx, recipe.duration + .05, this.random);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = recipe.resonance;
    const reverse = kind === 'agentWindowUp';
    const startFreq = reverse ? recipe.endFreq : recipe.startFreq;
    const endFreq = reverse ? recipe.startFreq : recipe.endFreq;
    filter.frequency.setValueAtTime(startFreq, now);
    filter.frequency.exponentialRampToValueAtTime(endFreq, end);
    const envelope = ctx.createGain();
    const curve = new Float32Array(128);
    for (let index = 0; index < curve.length; index++) {
      const time = index / (curve.length - 1);
      const distance = time < recipe.peak ? time / recipe.peak : (1 - time) / (1 - recipe.peak);
      curve[index] = Math.max(.0001, Math.pow(Math.max(0, distance), recipe.sharpness) * recipe.gain);
    }
    envelope.gain.setValueCurveAtTime(curve, now, recipe.duration);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(recipe.panStart, now);
    pan.pan.linearRampToValueAtTime(recipe.panEnd, end);
    const level = ctx.createGain();
    level.gain.value = this.mix.agentWindowSlideVolume ?? 1;
    const dry = ctx.createGain(); dry.gain.value = .7;
    const delay = ctx.createDelay(1); delay.delayTime.value = recipe.delay;
    const feedback = ctx.createGain(); feedback.gain.value = .28;
    const wet = ctx.createGain(); wet.gain.value = .35;
    source.connect(filter).connect(envelope).connect(pan);
    pan.connect(dry).connect(level).connect(output);
    pan.connect(delay).connect(wet).connect(level);
    delay.connect(feedback).connect(delay);
    this.trackVoice(kind, [source], level, source);
    source.start(now);
    source.stop(end + .05);
  }

  private playAgentWindowThock(ctx: AudioContext, output: AudioNode, kind: 'agentWindowThock' | 'flowDoorThock', at: number) {
    const recipe = kind === 'flowDoorThock' ? FLOW_DOOR_THOCK : AGENT_WINDOW_THOCK;
    const now = at;
    const end = now + recipe.duration;
    const oscillator = ctx.createOscillator();
    oscillator.type = recipe.wave as OscillatorType;
    oscillator.frequency.setValueAtTime(recipe.startFreq, now);
    oscillator.frequency.exponentialRampToValueAtTime(recipe.endFreq, end);
    const tone = ctx.createGain(); tone.gain.value = .55;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(.0001, now);
    envelope.gain.exponentialRampToValueAtTime(1, now + recipe.attack);
    envelope.gain.exponentialRampToValueAtTime(.0001, end);
    const bodyEnd = now + recipe.bodyDecay;
    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(recipe.bodyPitch * 1.15, now);
    body.frequency.exponentialRampToValueAtTime(recipe.bodyPitch * .82, bodyEnd);
    const bodyEnvelope = ctx.createGain();
    bodyEnvelope.gain.setValueAtTime(.0001, now);
    bodyEnvelope.gain.exponentialRampToValueAtTime(recipe.body * .72, now + .002);
    bodyEnvelope.gain.exponentialRampToValueAtTime(.0001, bodyEnd);
    const noise = ctx.createBufferSource();
    noise.buffer = whiteNoise(ctx, recipe.duration + .02, this.random);
    const noiseLevel = ctx.createGain(); noiseLevel.gain.value = recipe.noise;
    const clickDuration = .028;
    const click = ctx.createBufferSource();
    click.buffer = pinkNoise(ctx, clickDuration, this.random);
    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'bandpass'; clickFilter.frequency.value = 1800; clickFilter.Q.value = .8;
    const clickEnvelope = ctx.createGain();
    clickEnvelope.gain.setValueAtTime(recipe.click * .45, now);
    clickEnvelope.gain.exponentialRampToValueAtTime(.0001, now + clickDuration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = recipe.filter; filter.Q.value = recipe.resonance;
    const pan = ctx.createStereoPanner(); pan.pan.value = recipe.pan;
    const level = ctx.createGain(); level.gain.value = this.mix.agentWindowClickVolume ?? 1;
    oscillator.connect(tone).connect(envelope).connect(filter);
    noise.connect(noiseLevel).connect(envelope);
    body.connect(bodyEnvelope).connect(filter);
    click.connect(clickFilter).connect(clickEnvelope).connect(filter);
    filter.connect(pan).connect(level).connect(output);
    this.trackVoice(kind, [oscillator, noise, body, click], level, body);
    oscillator.start(now); noise.start(now); body.start(now); click.start(now);
    oscillator.stop(end + .02); noise.stop(end + .02); body.stop(bodyEnd + .02); click.stop(now + clickDuration);
  }

  private playNumberDropPiano(ctx: AudioContext, output: AudioNode, at: number) {
    const recipe = FLOW_NUMBER_DROP_PIANO;
    const now = at + .005;
    const finish = now + recipe.decay;
    const noteMix = ctx.createGain();
    noteMix.gain.value = recipe.volume * recipe.velocity;
    const level = ctx.createGain();
    level.gain.value = this.mix.numberDropVolume ?? 1;
    noteMix.connect(level);
    const dry = ctx.createGain();
    dry.gain.value = 1 - recipe.reverb * .3;
    level.connect(dry).connect(output);
    if (!this.twinkleReverb) {
      this.twinkleReverb = ctx.createConvolver();
      this.twinkleReverb.buffer = reverbImpulse(ctx, 2.8, this.random);
      this.twinkleReverb.connect(output);
    }
    const wet = ctx.createGain();
    wet.gain.value = recipe.reverb * .62;
    level.connect(wet).connect(this.twinkleReverb);
    const sources: AudioScheduledSourceNode[] = [];
    const harmonicBrightness = Math.min(.98, .3 + recipe.brightness * .62 + recipe.hardness * .08);
    for (const string of [-1, 0, 1]) for (let harmonic = 1; harmonic <= 7; harmonic++) {
      const oscillator = ctx.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = flowNumberDropFrequency(this.mix.numberDropBaseMidi) * harmonic * (1 + .00035 * harmonic * harmonic);
      oscillator.detune.value = recipe.detune + string * recipe.spread * 3.5;
      const envelope = ctx.createGain();
      const amplitude = harmonicBrightness ** (harmonic - 1) / harmonic ** 1.15 / 3;
      const partialDecay = Math.max(.16, recipe.decay / (1 + (harmonic - 1) * .28));
      envelope.gain.setValueAtTime(.0001, now);
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, amplitude), now + recipe.attack);
      envelope.gain.exponentialRampToValueAtTime(.0001, now + partialDecay);
      const pan = ctx.createStereoPanner();
      pan.pan.value = string * recipe.width;
      oscillator.connect(envelope).connect(pan).connect(noteMix);
      oscillator.start(now);
      oscillator.stop(finish + .05);
      sources.push(oscillator);
    }
    const hammer = ctx.createBufferSource();
    const hammerDuration = .018 + (1 - recipe.hardness) * .055;
    hammer.buffer = pinkNoise(ctx, hammerDuration, this.random);
    const hammerFilter = ctx.createBiquadFilter();
    hammerFilter.type = 'bandpass';
    hammerFilter.frequency.value = 900 + recipe.hardness * 7500;
    hammerFilter.Q.value = .7 + recipe.hardness * 2;
    const hammerLevel = ctx.createGain();
    hammerLevel.gain.setValueAtTime(recipe.hammer * recipe.velocity * .5, now);
    hammerLevel.gain.exponentialRampToValueAtTime(.0001, now + hammerDuration);
    hammer.connect(hammerFilter).connect(hammerLevel).connect(noteMix);
    hammer.start(now);
    hammer.stop(now + hammerDuration);
    sources.push(hammer);
    this.trackVoice('numberDropPiano', sources, level, sources[0]);
  }

  playDotTwinkle(noteIndex: number, pan: number, baseMidi = 84, envelopeGain = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.playDotTwinkleAt(noteIndex, pan, baseMidi, envelopeGain, this.ctx.currentTime + .005);
  }

  playDotTwinkleAt(noteIndex: number, pan: number, baseMidi = 84, envelopeGain = 1, at = 0) {
    if (!this.ctx || !this.output) return;
    const ctx = this.ctx;
    const recipe = DOT_TWINKLE_SHIMMER;
    const now = at;
    const finish = now + recipe.decay;
    const interval = recipe.intervals[((noteIndex % recipe.intervals.length) + recipe.intervals.length) % recipe.intervals.length];
    const note = midiToFrequency(baseMidi + interval);
    const noteMix = ctx.createGain();
    noteMix.gain.value = recipe.volume * recipe.velocity * Math.max(0, Math.min(1, envelopeGain));
    const level = ctx.createGain();
    level.gain.value = this.mix.twinkleVolume ?? 1;
    noteMix.connect(level);
    const dry = ctx.createGain();
    dry.gain.value = 1 - recipe.reverb * .3;
    level.connect(dry).connect(this.output);
    if (!this.twinkleReverb) {
      this.twinkleReverb = ctx.createConvolver();
      this.twinkleReverb.buffer = reverbImpulse(ctx, 2.8, this.random);
      this.twinkleReverb.connect(this.output);
    }
    const wet = ctx.createGain();
    wet.gain.value = recipe.reverb * .62;
    level.connect(wet).connect(this.twinkleReverb);
    const sources: AudioScheduledSourceNode[] = [];
    const harmonicBrightness = Math.min(.98, .3 + recipe.brightness * .62 + recipe.hardness * .08);
    for (const string of [-1, 0, 1]) for (let harmonic = 1; harmonic <= 7; harmonic++) {
      const oscillator = ctx.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = note * harmonic * (1 + .00035 * harmonic * harmonic);
      oscillator.detune.value = recipe.detune + string * recipe.spread * 3.5;
      const envelope = ctx.createGain();
      const amplitude = harmonicBrightness ** (harmonic - 1) / harmonic ** 1.15 / 3;
      const partialDecay = Math.max(.16, recipe.decay / (1 + (harmonic - 1) * .28));
      envelope.gain.setValueAtTime(.0001, now);
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, amplitude), now + recipe.attack);
      envelope.gain.exponentialRampToValueAtTime(.0001, now + partialDecay);
      const stereo = ctx.createStereoPanner();
      stereo.pan.value = Math.max(-1, Math.min(1, pan + string * recipe.width));
      oscillator.connect(envelope).connect(stereo).connect(noteMix);
      oscillator.start(now);
      oscillator.stop(finish + .05);
      sources.push(oscillator);
    }
    const hammer = ctx.createBufferSource();
    const hammerDuration = .018 + (1 - recipe.hardness) * .055;
    hammer.buffer = pinkNoise(ctx, hammerDuration, this.random);
    const hammerFilter = ctx.createBiquadFilter();
    hammerFilter.type = 'bandpass';
    hammerFilter.frequency.value = 900 + recipe.hardness * 7500;
    hammerFilter.Q.value = .7 + recipe.hardness * 2;
    const hammerLevel = ctx.createGain();
    hammerLevel.gain.setValueAtTime(recipe.hammer * recipe.velocity * .5, now);
    hammerLevel.gain.exponentialRampToValueAtTime(.0001, now + hammerDuration);
    hammer.connect(hammerFilter).connect(hammerLevel).connect(noteMix);
    hammer.start(now);
    hammer.stop(now + hammerDuration);
    sources.push(hammer);
    this.trackVoice('dotTwinkleShimmer', sources, level, sources[0]);
  }

  startDrone() {
    if (!this.ctx || !this.output || this.drone || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setTargetAtTime(this.masterGain, now, .015);
    const oscillators: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    const bus = this.ctx.createGain();
    bus.gain.value = this.mix.droneVolume;
    bus.connect(this.output);
    PIXEL_CONVEYOR_DRONE.notes.forEach((midi, index) => {
      const oscillator = this.ctx!.createOscillator();
      oscillator.type = PIXEL_CONVEYOR_DRONE.wave;
      oscillator.frequency.value = midiToFrequency(midi);
      oscillator.detune.value = (index - (PIXEL_CONVEYOR_DRONE.notes.length - 1) / 2) * 2.2;
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(PIXEL_CONVEYOR_DRONE.gain / Math.sqrt(PIXEL_CONVEYOR_DRONE.notes.length), now + PIXEL_CONVEYOR_DRONE.attack);
      const pan = this.ctx!.createStereoPanner();
      pan.pan.value = (index - (PIXEL_CONVEYOR_DRONE.notes.length - 1) / 2) * .18;
      oscillator.connect(gain).connect(pan).connect(bus);
      oscillator.start(now);
      oscillators.push(oscillator);
      gains.push(gain);
    });
    this.drone = {oscillators, gains, bus};
  }

  stopDrone() {
    if (!this.ctx || !this.drone) return;
    const now = this.ctx.currentTime;
    for (const gain of this.drone.gains) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(.0001, now, .03);
    }
    for (const oscillator of this.drone.oscillators) oscillator.stop(now + .16);
    this.drone = undefined;
  }

  dispose() {
    this.pause();
    void this.ctx?.close();
    this.ctx = undefined;
    this.output = undefined;
    this.streamBus = undefined;
    this.twinkleReverb = undefined;
  }

  private playPuff(ctx: AudioContext, output: AudioNode, at: number) {
    const now = at;
    const end = now + CLOUD_WHOOSH.duration;
    const source = ctx.createBufferSource();
    source.buffer = brownNoise(ctx, CLOUD_WHOOSH.duration + .03, this.random);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = CLOUD_WHOOSH.startFreq;
    filter.Q.value = CLOUD_WHOOSH.resonance;
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.value = CLOUD_WHOOSH.endFreq;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = CLOUD_WHOOSH.body;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(.0001, now);
    envelope.gain.exponentialRampToValueAtTime(CLOUD_WHOOSH.gain, now + CLOUD_WHOOSH.attack);
    envelope.gain.exponentialRampToValueAtTime(.0001, end);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(CLOUD_WHOOSH.panStart, now);
    pan.pan.linearRampToValueAtTime(CLOUD_WHOOSH.panEnd, end);
    const dry = ctx.createGain();
    dry.gain.value = .7;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = CLOUD_WHOOSH.delay;
    const wet = ctx.createGain();
    wet.gain.value = .35;
    source.connect(filter).connect(envelope);
    source.connect(bodyFilter).connect(bodyGain).connect(envelope);
    envelope.connect(pan);
    const level = ctx.createGain();
    level.gain.value = this.mix.puffVolume;
    this.trackVoice('puff', [source], level, source);
    pan.connect(dry).connect(level).connect(output);
    pan.connect(delay).connect(wet).connect(level);
    source.start(now);
    source.stop(end + .03);
  }

  private playTick(ctx: AudioContext, output: AudioNode, kind: 'tick' | 'flowRatchet', at: number) {
    const now = at;
    const end = now + TICK.duration;
    const oscillator = ctx.createOscillator();
    oscillator.type = TICK.wave as OscillatorType;
    oscillator.frequency.setValueAtTime(TICK.startFreq, now);
    oscillator.frequency.exponentialRampToValueAtTime(TICK.endFreq, end);
    const tone = ctx.createGain();
    tone.gain.value = .55;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(.0001, now);
    envelope.gain.exponentialRampToValueAtTime(1, now + TICK.attack);
    envelope.gain.exponentialRampToValueAtTime(.0001, end);
    const click = ctx.createBufferSource();
    click.buffer = pinkNoise(ctx, .028, this.random);
    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.value = 1800;
    clickFilter.Q.value = .8;
    const clickEnvelope = ctx.createGain();
    clickEnvelope.gain.setValueAtTime(TICK.click * .45, now);
    clickEnvelope.gain.exponentialRampToValueAtTime(.0001, now + .028);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = TICK.filter;
    filter.Q.value = TICK.resonance;
    oscillator.connect(tone).connect(envelope).connect(filter);
    click.connect(clickFilter).connect(clickEnvelope).connect(filter);
    const level = ctx.createGain();
    level.gain.value = kind === 'flowRatchet' ? this.mix.flowRatchetVolume ?? this.mix.tickVolume : this.mix.tickVolume;
    this.trackVoice(kind, [oscillator, click], level, oscillator);
    filter.connect(level).connect(output);
    oscillator.start(now);
    click.start(now);
    oscillator.stop(end + .02);
    click.stop(now + .028);
  }

  private playFlowReveal(ctx: AudioContext, output: AudioNode, duration: number, at: number) {
    const recipe = FLOW_REVEAL_PAD;
    const now = at;
    const attack = Math.max(.01, Math.min(duration - .01, this.mix.flowRevealTimeToPeak ?? recipe.timeToPeak));
    const tail = Math.max(.01, Math.min(duration - attack, this.mix.flowRevealTail ?? recipe.tail));
    const end = now + attack + tail;
    const sources: OscillatorNode[] = [];
    const level = ctx.createGain();
    level.gain.value = this.mix.flowRevealVolume ?? 1;
    level.connect(output);
    recipe.notes.forEach((midi, index) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = recipe.wave;
      oscillator.frequency.value = midiToFrequency(midi);
      oscillator.detune.value = (index - (recipe.notes.length - 1) / 2) * 2.2;
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(.0001, now);
      envelope.gain.exponentialRampToValueAtTime(recipe.gain / Math.sqrt(recipe.notes.length), now + attack);
      envelope.gain.exponentialRampToValueAtTime(.0001, end);
      const pan = ctx.createStereoPanner();
      pan.pan.value = (index - (recipe.notes.length - 1) / 2) * .18;
      oscillator.connect(envelope).connect(pan).connect(level);
      oscillator.start(now);
      oscillator.stop(end + .05);
      sources.push(oscillator);
    });
    this.trackVoice('flowReveal', sources, level, sources[0]);
  }

  private playCameraMove(ctx: AudioContext, output: AudioNode, duration: number, at: number) {
    if ((this.mix.cameraSound ?? 'deepCamera') === 'procedural') {
      this.playProceduralCameraMove(ctx, output, duration, at);
      return;
    }
    const closest = CAMERA_MOVE_SAMPLE_VARIANTS.reduce((best, candidate) =>
      Math.abs(candidate.duration - duration) < Math.abs(best.duration - duration) ? candidate : best);
    const buffer = this.cameraMoveBuffers.get(closest.duration);
    if (!buffer) return;

    const now = at;
    const end = now + duration;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // Variants are pitch-preserving FFmpeg renders. This tiny correction only
    // removes codec/filter rounding so the tail lands exactly on the camera bar.
    source.playbackRate.value = buffer.duration / duration;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(.0001, now);
    envelope.gain.linearRampToValueAtTime(1, now + Math.min(.008, duration / 4));
    envelope.gain.setValueAtTime(1, Math.max(now + .008, end - .02));
    envelope.gain.linearRampToValueAtTime(.0001, end);
    const level = ctx.createGain();
    level.gain.value = this.mix.cameraVolume ?? 1;
    source.connect(envelope).connect(level).connect(output);
    this.trackVoice('cameraMove', [source], level, source);
    source.start(now);
    source.stop(end + .01);
  }

  private playProceduralCameraMove(ctx: AudioContext, output: AudioNode, duration: number, at: number) {
    const recipe = CAMERA_MOVE_WHOOSH;
    const end = at + duration;
    const source = ctx.createBufferSource();
    source.buffer = brownNoise(ctx, duration + .05, this.random);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = recipe.startFreq; filter.Q.value = recipe.resonance;
    const bodyFilter = ctx.createBiquadFilter(); bodyFilter.type = 'lowpass'; bodyFilter.frequency.value = 420;
    const bodyLevel = ctx.createGain(); bodyLevel.gain.value = recipe.body;
    const envelope = ctx.createGain();
    const curve = new Float32Array(128);
    for (let index = 0; index < curve.length; index++) {
      const time = index / (curve.length - 1);
      const distance = time < recipe.peak ? time / recipe.peak : (1 - time) / (1 - recipe.peak);
      curve[index] = Math.max(.0001, Math.pow(Math.max(0, distance), recipe.sharpness) * recipe.gain);
    }
    envelope.gain.setValueCurveAtTime(curve, at, duration);
    const pan = ctx.createStereoPanner(); pan.pan.setValueAtTime(recipe.panStart, at); pan.pan.linearRampToValueAtTime(recipe.panEnd, end);
    const dry = ctx.createGain(); dry.gain.value = .7;
    const delay = ctx.createDelay(1); delay.delayTime.value = recipe.delay;
    const feedback = ctx.createGain(); feedback.gain.value = .28;
    const wet = ctx.createGain(); wet.gain.value = .35;
    const level = ctx.createGain(); level.gain.value = this.mix.cameraVolume ?? 1;
    source.connect(filter).connect(envelope);
    source.connect(bodyFilter).connect(bodyLevel).connect(envelope);
    envelope.connect(pan); pan.connect(dry).connect(level).connect(output); pan.connect(delay).connect(wet).connect(level); delay.connect(feedback).connect(delay);
    this.trackVoice('cameraMove', [source], level, source);
    source.start(at); source.stop(end + .05);
  }

  private playCheapAgentWhoosh(ctx: AudioContext, output: AudioNode, kind: 'cheapWhooshLeftToRight' | 'cheapWhooshRightToLeft', duration: number, at: number) {
    const buffer = this.cheapAgentWhooshBuffers.get(kind);
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = buffer.duration / duration;
    const level = ctx.createGain();
    level.gain.value = this.mix.cameraVolume ?? 1;
    source.connect(level).connect(output);
    this.trackVoice(kind, [source], level, source);
    source.start(at);
    source.stop(at + duration + .01);
  }

  private playDrawerBubble(ctx: AudioContext, output: AudioNode, at: number) {
    const now = at;
    const level = ctx.createGain();
    level.gain.value = this.mix.drawerVolume ?? 1;
    level.connect(output);
    const sources = DRAWER_BUBBLE_PAIR.map(recipe => {
      const start = now + recipe.offset;
      const end = start + recipe.duration;
      const oscillator = ctx.createOscillator();
      oscillator.type = recipe.wave as OscillatorType;
      oscillator.frequency.setValueAtTime(recipe.startFreq, start);
      oscillator.frequency.exponentialRampToValueAtTime(recipe.endFreq, end);
      const tone = ctx.createGain();
      tone.gain.value = .55;
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(.0001, start);
      envelope.gain.exponentialRampToValueAtTime(1, start + recipe.attack);
      envelope.gain.exponentialRampToValueAtTime(.0001, end);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = recipe.filter;
      filter.Q.value = recipe.resonance;
      const pan = ctx.createStereoPanner();
      pan.pan.value = recipe.pan;
      oscillator.connect(tone).connect(envelope).connect(filter).connect(pan).connect(level);
      oscillator.start(start);
      oscillator.stop(end + .02);
      return oscillator;
    });
    this.trackVoice('drawerBubble', sources, level, sources.at(-1)!);
  }

  private playDrawerWhoosh(ctx: AudioContext, output: AudioNode, at: number) {
    const recipe = DRAWER_WHISTLE_WHOOSH;
    const now = at;
    const end = now + recipe.duration;
    const source = ctx.createBufferSource();
    source.buffer = brownNoise(ctx, recipe.duration + .05, this.random);
    const sweep = ctx.createBiquadFilter();
    sweep.type = 'bandpass';
    sweep.Q.value = recipe.resonance;
    sweep.frequency.setValueAtTime(recipe.startFreq, now);
    sweep.frequency.exponentialRampToValueAtTime(recipe.endFreq, end);
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.value = 420;
    const bodyLevel = ctx.createGain();
    bodyLevel.gain.value = recipe.body;
    const envelope = ctx.createGain();
    const curve = new Float32Array(128);
    for (let index = 0; index < curve.length; index++) {
      const time = index / (curve.length - 1);
      const distance = time < recipe.peak ? time / recipe.peak : (1 - time) / (1 - recipe.peak);
      curve[index] = Math.max(.0001, Math.pow(Math.max(0, distance), recipe.sharpness) * recipe.gain);
    }
    envelope.gain.setValueCurveAtTime(curve, now, recipe.duration);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(recipe.panStart, now);
    pan.pan.linearRampToValueAtTime(recipe.panEnd, end);
    const dry = ctx.createGain(); dry.gain.value = .7;
    const delay = ctx.createDelay(1); delay.delayTime.value = recipe.delay;
    const feedback = ctx.createGain(); feedback.gain.value = .28;
    const wet = ctx.createGain(); wet.gain.value = .35;
    const level = ctx.createGain(); level.gain.value = this.mix.drawerVolume ?? 1;
    source.connect(sweep).connect(envelope);
    source.connect(bodyFilter).connect(bodyLevel).connect(envelope);
    envelope.connect(pan);
    pan.connect(dry).connect(level).connect(output);
    pan.connect(delay).connect(wet).connect(level);
    delay.connect(feedback).connect(delay);
    this.trackVoice('drawerWhoosh', [source], level, source);
    source.start(now);
    source.stop(end + .05);
  }

  private playCloudWhoosh(ctx: AudioContext, output: AudioNode, kind: 'cloudIn' | 'cloudOut' | 'cloudPuff', duration: number, at: number) {
    const recipe = kind === 'cloudPuff' ? LIGHT_CLOUD_PUFF : kind === 'cloudIn' ? CLOUD_WHOOSH_IN : CLOUD_WHOOSH;
    const now = at;
    const end = now + duration;
    const source = ctx.createBufferSource();
    source.buffer = recipe.noiseColor === 'pink' ? pinkNoise(ctx, duration + .05, this.random) : brownNoise(ctx, duration + .05, this.random);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = recipe.resonance;
    filter.frequency.setValueAtTime(recipe.startFreq, now);
    if (recipe.filterMotion === 'sweep') filter.frequency.exponentialRampToValueAtTime(recipe.endFreq, end);
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.value = 420;
    const bodyLevel = ctx.createGain();
    bodyLevel.gain.value = recipe.body;
    const envelope = ctx.createGain();
    const curve = new Float32Array(128);
    const attackRatio = Math.min(.95, Math.max(.001, recipe.attack / duration));
    const decayCurve = Math.max(.2, recipe.decayCurve);
    const tail = Math.exp(-decayCurve);
    for (let index = 0; index < curve.length; index++) {
      const time = index / (curve.length - 1);
      const attackStart = recipe.envelopeShape === 'puff' ? .18 : 0;
      const level = time < attackRatio ? attackStart + (1 - attackStart) * time / attackRatio
        : (Math.exp(-decayCurve * ((time - attackRatio) / (1 - attackRatio))) - tail) / (1 - tail);
      curve[index] = Math.max(.0001, level * recipe.gain);
    }
    envelope.gain.setValueCurveAtTime(curve, now, duration);
    const shaper = ctx.createWaveShaper();
    const distortion = new Float32Array(256);
    const amount = recipe.distortion / 100 * 3;
    for (let index = 0; index < distortion.length; index++) {
      const value = index * 2 / distortion.length - 1;
      distortion[index] = (1 + amount) * value / (1 + amount * Math.abs(value));
    }
    shaper.curve = distortion;
    shaper.oversample = '2x';
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(recipe.panStart, now);
    pan.pan.linearRampToValueAtTime(recipe.panEnd, end);
    const dry = ctx.createGain(); dry.gain.value = .7;
    const delay = ctx.createDelay(1); delay.delayTime.value = recipe.delay;
    const feedback = ctx.createGain(); feedback.gain.value = recipe.delay ? .28 : 0;
    const wet = ctx.createGain(); wet.gain.value = recipe.delay ? .35 : 0;
    const level = ctx.createGain(); level.gain.value = this.mix.whooshVolume ?? 1;
    source.connect(filter).connect(envelope);
    source.connect(bodyFilter).connect(bodyLevel).connect(envelope);
    if (recipe.distortion > 0) envelope.connect(shaper).connect(pan);
    else envelope.connect(pan);
    pan.connect(dry).connect(level).connect(output);
    pan.connect(delay).connect(wet).connect(level);
    delay.connect(feedback).connect(delay);
    this.trackVoice(kind, [source], level, source);
    source.start(now);
    source.stop(end + .05);
  }

  private trackVoice(kind: Micro10AudioVoiceKind, sources: AudioScheduledSourceNode[], level: GainNode, finalSource: AudioScheduledSourceNode) {
    const voice = {kind, sources, level};
    this.activeVoices.add(voice);
    finalSource.addEventListener('ended', () => this.activeVoices.delete(voice), {once: true});
  }

  private stopVoices(duration: number, matches: (voice: {kind: Micro10AudioVoiceKind}) => boolean = () => true) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const voice of [...this.activeVoices]) {
      if (!matches(voice)) continue;
      voice.level.gain.cancelScheduledValues(now);
      voice.level.gain.setValueAtTime(Math.max(.0001, voice.level.gain.value), now);
      voice.level.gain.exponentialRampToValueAtTime(.0001, now + duration);
      for (const source of voice.sources) {
        try { source.stop(now + duration + .01); } catch { /* The source already ended. */ }
      }
      this.activeVoices.delete(voice);
    }
  }
}
