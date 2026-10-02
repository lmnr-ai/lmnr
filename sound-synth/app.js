const STORAGE_KEY = "signal-lab-sounds-v1";
const DESCENDING_PIANO_MIGRATION_KEY = "signal-lab-descending-piano-v1";
const DESCENDING_PIANO_SOUND = PianoSequence.descendingGEC;
let activeMode = "whoosh";
let context;
let activeDrone = null;
let savedSounds = loadSaved();

const presets = {
  whoosh: {
    soft: { noiseColor: "pink", duration: 1.2, body: .08, filterMotion: "sweep", startFreq: 350, endFreq: 4200, resonance: 1.2, envelopeShape: "swell", attack: .12, decayCurve: 3, gain: .5, peak: .52, sharpness: .7, distortion: 0, panStart: -.35, panEnd: .35, delay: .03 },
    fast: { noiseColor: "white", duration: .24, body: .05, filterMotion: "sweep", startFreq: 500, endFreq: 9000, resonance: 2.5, envelopeShape: "swell", attack: .02, decayCurve: 5, gain: .46, peak: .42, sharpness: 2.8, distortion: 3, panStart: -.8, panEnd: .8, delay: 0 },
    heavy: { noiseColor: "brown", duration: 1.5, body: .75, filterMotion: "sweep", startFreq: 120, endFreq: 1800, resonance: .8, envelopeShape: "swell", attack: .18, decayCurve: 2.5, gain: .55, peak: .58, sharpness: .8, distortion: 16, panStart: -.55, panEnd: .55, delay: .08 },
    rise: { noiseColor: "pink", duration: 2.4, body: .12, filterMotion: "sweep", startFreq: 180, endFreq: 11000, resonance: 5, envelopeShape: "swell", attack: .3, decayCurve: 3, gain: .48, peak: .82, sharpness: 1.4, distortion: 2, panStart: -.2, panEnd: .75, delay: .12 },
    scifi: { noiseColor: "white", duration: .72, body: .28, filterMotion: "sweep", startFreq: 8500, endFreq: 240, resonance: 14, envelopeShape: "swell", attack: .05, decayCurve: 5, gain: .44, peak: .46, sharpness: 2.1, distortion: 28, panStart: .9, panEnd: -.9, delay: .16 },
    smoke: { noiseColor: "pink", duration: .52, body: 0, filterMotion: "static", startFreq: 1500, endFreq: 1500, resonance: .65, envelopeShape: "puff", attack: .035, decayCurve: 7, gain: .025, peak: .07, sharpness: .7, distortion: 0, panStart: .26, panEnd: .26, delay: 0 },
    pillow: { noiseColor: "pink", duration: .64, body: .16, filterMotion: "sweep", startFreq: 920, endFreq: 540, resonance: .75, envelopeShape: "puff", attack: .045, decayCurve: 5.8, gain: .16, peak: .09, sharpness: .8, distortion: 0, panStart: -.05, panEnd: .05, delay: .018 },
  },
  beep: {
    clean: { wave: "sine", startFreq: 1200, endFreq: 1200, noise: 0, click: .04, body: .08, bodyPitch: 220, bodyDecay: .07, duration: .18, attack: .004, filter: 8000, resonance: 1, distortion: 0, pan: 0, delay: 0, feedback: 0 },
    click: { wave: "square", startFreq: 2200, endFreq: 180, noise: .18, click: .7, body: .18, bodyPitch: 190, bodyDecay: .055, duration: .045, attack: .001, filter: 9000, resonance: 1, distortion: 24, pan: 0, delay: 0, feedback: 0 },
    chirp: { wave: "sine", startFreq: 700, endFreq: 2800, noise: .01, click: .08, body: .12, bodyPitch: 210, bodyDecay: .07, duration: .16, attack: .003, filter: 7500, resonance: 4, distortion: 2, pan: 0, delay: .03, feedback: .08 },
    confirm: { wave: "triangle", startFreq: 900, endFreq: 1450, noise: 0, click: .12, body: .28, bodyPitch: 180, bodyDecay: .11, duration: .34, attack: .008, filter: 6000, resonance: 3, distortion: 2, pan: .08, delay: .09, feedback: .2 },
    alert: { wave: "square", startFreq: 1900, endFreq: 1500, noise: .03, click: .18, body: .22, bodyPitch: 170, bodyDecay: .13, duration: .52, attack: .006, filter: 5000, resonance: 8, distortion: 12, pan: 0, delay: .14, feedback: .36 },
    thock: { wave: "triangle", startFreq: 520, endFreq: 380, noise: .02, click: .42, body: .88, bodyPitch: 145, bodyDecay: .12, duration: .13, attack: .001, filter: 1900, resonance: 1.2, distortion: 3, pan: 0, delay: 0, feedback: 0 },
  },
  drone: {
    morning: { root: "130.81", harmony: "major", voices: 4, wave: "sine", brightness: 1800, warmth: .24, motionRate: .1, motionDepth: .18, drift: 3, width: .55, reverb: .5, volume: .16 },
    open: { root: "196", harmony: "open", voices: 4, wave: "sine", brightness: 2400, warmth: .12, motionRate: .07, motionDepth: .12, drift: 2, width: .75, reverb: .62, volume: .14 },
    warm: { root: "146.83", harmony: "major", voices: 3, wave: "triangle", brightness: 1100, warmth: .55, motionRate: .06, motionDepth: .2, drift: 4, width: .4, reverb: .42, volume: .13 },
    lift: { root: "174.61", harmony: "suspended", voices: 5, wave: "sine", brightness: 2800, warmth: .18, motionRate: .16, motionDepth: .28, drift: 5, width: .8, reverb: .68, volume: .13 },
    shimmer: { root: "220", harmony: "major", voices: 5, wave: "sine", brightness: 5200, warmth: .08, motionRate: .22, motionDepth: .16, drift: 7, width: .9, reverb: .74, volume: .1 },
  },
  piano: {
    natural: { root: "261.63", velocity: .68, detune: 0, hardness: .52, hammer: .2, attack: .004, decay: 2.8, brightness: .58, spread: .38, width: .48, reverb: .34, volume: .24 },
    mellow: { root: "261.63", velocity: .55, detune: 0, hardness: .22, hammer: .08, attack: .009, decay: 3.6, brightness: .3, spread: .28, width: .42, reverb: .42, volume: .22 },
    bright: { root: "392", velocity: .82, detune: 0, hardness: .82, hammer: .34, attack: .002, decay: 2.2, brightness: .9, spread: .46, width: .62, reverb: .28, volume: .2 },
    felt: { root: "220", velocity: .48, detune: -2, hardness: .12, hammer: .04, attack: .014, decay: 4.2, brightness: .2, spread: .22, width: .35, reverb: .55, volume: .24 },
    delicate: { root: "523.25", velocity: .38, detune: 1.5, hardness: .35, hammer: .1, attack: .006, decay: 3.1, brightness: .48, spread: .55, width: .72, reverb: .64, volume: .17 },
  },
  engine: {
    servo: { ...EngineSynth.DEFAULTS.servo },
    turbine: { ...EngineSynth.DEFAULTS.turbine },
    mechanical: { ...EngineSynth.DEFAULTS.mechanical },
    softPawl: { ...EngineSynth.DEFAULTS.ratchet, direction: "ratchet", note: 55, speed: .16, brightness: .3, resonance: 1.5, clickLevel: .25, clickTone: .25, clickDecay: 62, teeth: 3, whirrLevel: .3 },
    woodenWheel: { ...EngineSynth.DEFAULTS.ratchet, direction: "ratchet", note: 60, speed: .25, brightness: .46, resonance: 2.4, clickLevel: .38, clickTone: .4, clickDecay: 42, teeth: 5, whirrLevel: .24 },
    digitalRatchet: { ...EngineSynth.DEFAULTS.ratchet, direction: "ratchet", note: 72, speed: .4, brightness: .82, resonance: 4.2, noise: .06, clickLevel: .3, clickTone: .84, clickDecay: 16, teeth: 7, whirrLevel: .15 },
  },
};

function workspace(mode = activeMode) {
  return document.querySelector(`[data-workspace="${mode}"]`);
}

function rawSettings(mode = activeMode) {
  return Object.fromEntries([...workspace(mode).querySelectorAll("[data-param]")].map((input) => [
    input.dataset.param,
    input.type === "range" ? Number(input.value) : input.value,
  ]));
}

function readSettings(mode = activeMode) {
  const settings = rawSettings(mode);
  return mode === "engine" ? EngineSynth.normalizeSettings(settings) : settings;
}

function setSettings(mode, settings) {
  // Engine entries are normalized against their direction defaults first. This prevents
  // controls absent from an old saved entry inheriting unrelated values from the form.
  const values = mode === "engine" ? EngineSynth.normalizeSettings(settings) : settings;
  for (const [key, value] of Object.entries(values)) {
    const input = workspace(mode).querySelector(`[data-param="${key}"]`);
    if (input) input.value = value;
  }
  updateOutputs(mode);
  if (mode === "engine") document.querySelectorAll("[data-ratchet-only]").forEach((element) => { element.hidden = values.direction !== "ratchet"; });
}

function formatValue(key, value, mode) {
  if (["body", "click", "peak", "gain", "noise", "feedback", "warmth", "motionDepth", "width", "reverb", "volume", "velocity", "hardness", "hammer", "spread", "speed", "power", "brightness", "pulseDepth", "clickLevel", "clickTone", "whirrLevel"].includes(key) && !(key === "brightness" && mode !== "engine" && mode !== "piano")) return `${Math.round(value * 100)}%`;
  if (["startFreq", "endFreq", "bodyPitch", "filter", "brightness"].includes(key)) return `${Math.round(value)} Hz`;
  if (["duration", "attack", "bodyDecay", "delay", "decay", "spinUp", "spinDown"].includes(key)) return `${Number(value)} s`;
  if (key === "clickDecay") return `${Math.round(value)} ms`;
  if (key === "note") return `${EngineSynth.noteName(Number(value))} · ${EngineSynth.midiFrequency(Number(value), Number(rawSettings("engine").detune)).toFixed(2)} Hz`;
  if (key === "motionRate") return `${Number(value)} Hz`;
  if (["drift", "detune"].includes(key)) return `${Number(value)} ct`;
  if (key === "resonance") return `${Number(value)} Q`;
  return String(Number(value));
}

function updateOutputs(mode = activeMode) {
  const panel = workspace(mode);
  panel.querySelectorAll("output[data-for]").forEach((output) => {
    const input = panel.querySelector(`[data-param="${output.dataset.for}"]`);
    output.textContent = formatValue(output.dataset.for, input.value, mode);
  });
}

function audioContext() {
  context ??= new AudioContext();
  if (context.state === "suspended") context.resume();
  return context;
}

function makeNoise(ctx, seconds, color = "white") {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (color === "brown") {
      brown = (brown + .02 * white) / 1.02;
      data[i] = brown * 3.5;
    } else if (color === "pink") {
      b0 = .99886 * b0 + white * .0555179;
      b1 = .99332 * b1 + white * .0750759;
      b2 = .969 * b2 + white * .153852;
      b3 = .8665 * b3 + white * .3104856;
      b4 = .55 * b4 + white * .5329522;
      b5 = -.7616 * b5 - white * .016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * .5362) * .11;
      b6 = white * .115926;
    } else data[i] = white;
  }
  return buffer;
}

function distortionCurve(amount) {
  const curve = new Float32Array(256);
  const k = amount * 3;
  for (let i = 0; i < curve.length; i++) {
    const x = i * 2 / curve.length - 1;
    curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
  }
  return curve;
}

function connectSpace(ctx, input, settings, movingPan = false) {
  const pan = ctx.createStereoPanner();
  const now = ctx.currentTime + .01;
  if (movingPan) {
    pan.pan.setValueAtTime(settings.panStart, now);
    pan.pan.linearRampToValueAtTime(settings.panEnd, now + settings.duration);
  } else pan.pan.value = settings.pan;

  const dry = ctx.createGain();
  dry.gain.value = .7;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = settings.delay;
  const feedback = ctx.createGain();
  feedback.gain.value = settings.feedback ?? (settings.delay ? .28 : 0);
  const wet = ctx.createGain();
  wet.gain.value = settings.delay ? .35 : 0;

  input.connect(pan);
  pan.connect(dry).connect(ctx.destination);
  pan.connect(delay).connect(wet).connect(ctx.destination);
  delay.connect(feedback).connect(delay);
}

function playWhoosh(settings) {
  const ctx = audioContext();
  const now = ctx.currentTime + .01;
  const end = now + settings.duration;
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoise(ctx, settings.duration + .05, settings.noiseColor);

  const sweep = ctx.createBiquadFilter();
  sweep.type = "bandpass";
  sweep.Q.value = settings.resonance;
  sweep.frequency.setValueAtTime(settings.startFreq, now);
  if (settings.filterMotion !== "static") sweep.frequency.exponentialRampToValueAtTime(settings.endFreq, end);

  const bodyFilter = ctx.createBiquadFilter();
  bodyFilter.type = "lowpass";
  bodyFilter.frequency.value = 420;
  const bodyLevel = ctx.createGain();
  bodyLevel.gain.value = settings.body;
  const envelope = ctx.createGain();
  const curve = new Float32Array(128);
  const shape = settings.envelopeShape ?? "swell";
  const attackRatio = Math.min(.95, Math.max(.001, settings.attack ?? .03) / settings.duration);
  const decayCurve = Math.max(.2, settings.decayCurve ?? 4);
  for (let i = 0; i < curve.length; i++) {
    const time = i / (curve.length - 1);
    let level;
    if (shape === "swell") {
      const distance = time < settings.peak ? time / settings.peak : (1 - time) / (1 - settings.peak);
      level = Math.pow(Math.max(0, distance), settings.sharpness);
    } else if (time < attackRatio) {
      const start = shape === "puff" ? .18 : 0;
      level = start + (1 - start) * time / attackRatio;
    } else {
      const decay = (time - attackRatio) / (1 - attackRatio);
      if (shape === "linear") level = 1 - decay;
      else {
        const tail = Math.exp(-decayCurve);
        level = (Math.exp(-decayCurve * decay) - tail) / (1 - tail);
      }
    }
    curve[i] = Math.max(.0001, level * (settings.gain ?? .5));
  }
  envelope.gain.setValueCurveAtTime(curve, now, settings.duration);

  const shaper = ctx.createWaveShaper();
  shaper.curve = distortionCurve(settings.distortion / 100);
  shaper.oversample = "2x";
  noise.connect(sweep).connect(envelope);
  noise.connect(bodyFilter).connect(bodyLevel).connect(envelope);
  envelope.connect(shaper);
  connectSpace(ctx, shaper, settings, true);
  noise.start(now);
  noise.stop(end + .05);
}

function playBeep(settings) {
  const ctx = audioContext();
  const now = ctx.currentTime + .01;
  const end = now + settings.duration;
  const oscillator = ctx.createOscillator();
  oscillator.type = settings.wave;
  oscillator.frequency.setValueAtTime(settings.startFreq, now);
  oscillator.frequency.exponentialRampToValueAtTime(settings.endFreq, end);
  const toneLevel = ctx.createGain();
  toneLevel.gain.value = .55;

  const noise = ctx.createBufferSource();
  noise.buffer = makeNoise(ctx, settings.duration + .02);
  const noiseLevel = ctx.createGain();
  noiseLevel.gain.value = settings.noise;
  const envelope = ctx.createGain();
  const attackEnd = now + Math.min(settings.attack, settings.duration * .8);
  envelope.gain.setValueAtTime(.0001, now);
  envelope.gain.exponentialRampToValueAtTime(1, attackEnd);
  envelope.gain.exponentialRampToValueAtTime(.0001, end);

  const bodyPitch = settings.bodyPitch ?? Math.max(80, Math.min(300, settings.startFreq / 4));
  const bodyDecay = settings.bodyDecay ?? Math.min(.1, settings.duration);
  const bodyEnd = now + bodyDecay;
  const body = ctx.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(bodyPitch * 1.15, now);
  body.frequency.exponentialRampToValueAtTime(bodyPitch * .82, bodyEnd);
  const bodyEnvelope = ctx.createGain();
  bodyEnvelope.gain.setValueAtTime(.0001, now);
  bodyEnvelope.gain.exponentialRampToValueAtTime(Math.max(.0001, (settings.body ?? 0) * .72), now + .002);
  bodyEnvelope.gain.exponentialRampToValueAtTime(.0001, bodyEnd);

  const clickDuration = .028;
  const click = ctx.createBufferSource();
  click.buffer = makeNoise(ctx, clickDuration, "pink");
  const clickFilter = ctx.createBiquadFilter();
  clickFilter.type = "bandpass";
  clickFilter.frequency.value = 1800;
  clickFilter.Q.value = .8;
  const clickEnvelope = ctx.createGain();
  clickEnvelope.gain.setValueAtTime(Math.max(.0001, (settings.click ?? 0) * .45), now);
  clickEnvelope.gain.exponentialRampToValueAtTime(.0001, now + clickDuration);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = settings.filter;
  filter.Q.value = settings.resonance;
  const shaper = ctx.createWaveShaper();
  shaper.curve = distortionCurve(settings.distortion / 100);
  shaper.oversample = "2x";

  oscillator.connect(toneLevel).connect(envelope);
  noise.connect(noiseLevel).connect(envelope);
  envelope.connect(filter);
  body.connect(bodyEnvelope).connect(filter);
  click.connect(clickFilter).connect(clickEnvelope).connect(filter);
  filter.connect(shaper);
  connectSpace(ctx, shaper, settings);
  oscillator.start(now);
  body.start(now);
  click.start(now);
  noise.start(now);
  oscillator.stop(end + .02);
  body.stop(bodyEnd + .02);
  click.stop(now + clickDuration);
  noise.stop(end + .02);
}

function playPianoNote(ctx, settings, root, now) {
  const finish = now + settings.decay;
  const mix = ctx.createGain();
  mix.gain.value = settings.volume * settings.velocity;
  const strings = [-1, 0, 1];
  const harmonicBrightness = Math.min(.98, .3 + settings.brightness * .62 + settings.hardness * .08);

  for (const string of strings) {
    for (let harmonic = 1; harmonic <= 7; harmonic++) {
      const oscillator = ctx.createOscillator();
      oscillator.type = "sine";
      const stretch = 1 + .00035 * harmonic * harmonic;
      oscillator.frequency.value = root * harmonic * stretch;
      oscillator.detune.value = settings.detune + string * settings.spread * 3.5;

      const envelope = ctx.createGain();
      const amplitude = Math.pow(harmonicBrightness, harmonic - 1) / Math.pow(harmonic, 1.15) / strings.length;
      const partialDecay = Math.max(.16, settings.decay / (1 + (harmonic - 1) * .28));
      envelope.gain.setValueAtTime(.0001, now);
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, amplitude), now + settings.attack);
      envelope.gain.exponentialRampToValueAtTime(.0001, now + partialDecay);

      const pan = ctx.createStereoPanner();
      pan.pan.value = string * settings.width;
      oscillator.connect(envelope).connect(pan).connect(mix);
      oscillator.start(now);
      oscillator.stop(finish + .05);
    }
  }

  const hammerNoise = ctx.createBufferSource();
  const hammerDuration = .018 + (1 - settings.hardness) * .055;
  hammerNoise.buffer = makeNoise(ctx, hammerDuration, "pink");
  const hammerFilter = ctx.createBiquadFilter();
  hammerFilter.type = "bandpass";
  hammerFilter.frequency.value = 900 + settings.hardness * 7500;
  hammerFilter.Q.value = .7 + settings.hardness * 2;
  const hammerLevel = ctx.createGain();
  hammerLevel.gain.setValueAtTime(settings.hammer * settings.velocity * .5, now);
  hammerLevel.gain.exponentialRampToValueAtTime(.0001, now + hammerDuration);
  hammerNoise.connect(hammerFilter).connect(hammerLevel).connect(mix);
  hammerNoise.start(now);
  hammerNoise.stop(now + hammerDuration);

  const dry = ctx.createGain();
  dry.gain.value = 1 - settings.reverb * .3;
  const convolver = ctx.createConvolver();
  convolver.buffer = reverbImpulse(ctx, 2.8);
  const wet = ctx.createGain();
  wet.gain.value = settings.reverb * .62;
  mix.connect(dry).connect(ctx.destination);
  mix.connect(convolver).connect(wet).connect(ctx.destination);
}

function playPiano(settings) {
  const ctx = audioContext();
  const now = ctx.currentTime + .01;
  PianoSequence.notes(settings).forEach((note) => playPianoNote(ctx, settings, note.root, now + note.offset));
}

function reverbImpulse(ctx, seconds = 2.5) {
  const buffer = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.4);
    }
  }
  return buffer;
}

function stopDrone(immediate = false) {
  if (!activeDrone) return;
  const ctx = audioContext();
  const stopAt = ctx.currentTime + (immediate ? .03 : 1);
  activeDrone.master.gain.cancelScheduledValues(ctx.currentTime);
  activeDrone.master.gain.setTargetAtTime(.0001, ctx.currentTime, immediate ? .005 : .25);
  for (const source of activeDrone.sources) {
    try { source.stop(stopAt); } catch {}
  }
  activeDrone = null;
  if (activeMode === "drone") document.querySelector("#play").innerHTML = "▶ play drone <kbd>space</kbd>";
}

function startDrone(settings) {
  stopDrone(true);
  const ctx = audioContext();
  const now = ctx.currentTime + .02;
  const root = Number(settings.root);
  const intervals = {
    major: [1, 1.25, 1.5, 2, 2.5],
    open: [1, 1.5, 2, 3, 4],
    suspended: [1, 4 / 3, 1.5, 2, 8 / 3],
    octaves: [.5, 1, 2, 4, 8],
  }[settings.harmony];
  const sources = [];
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = settings.brightness;
  filter.Q.value = .5;
  const master = ctx.createGain();
  master.gain.setValueAtTime(.0001, now);
  master.gain.exponentialRampToValueAtTime(settings.volume, now + 1.8);

  const lfo = ctx.createOscillator();
  lfo.frequency.value = settings.motionRate;
  const movement = ctx.createGain();
  movement.gain.value = settings.volume * settings.motionDepth * .24;
  lfo.connect(movement).connect(master.gain);
  const pitchDrift = ctx.createGain();
  pitchDrift.gain.value = settings.drift;
  lfo.connect(pitchDrift);

  for (let index = 0; index < settings.voices; index++) {
    const oscillator = ctx.createOscillator();
    oscillator.type = settings.wave;
    oscillator.frequency.value = root * intervals[index];
    oscillator.detune.value = (index - (settings.voices - 1) / 2) * 2.5;
    pitchDrift.connect(oscillator.detune);
    const level = ctx.createGain();
    level.gain.value = .72 / settings.voices;
    const pan = ctx.createStereoPanner();
    pan.pan.value = settings.voices === 1 ? 0 : (-settings.width + index * (settings.width * 2 / (settings.voices - 1)));
    oscillator.connect(level).connect(pan).connect(filter);
    oscillator.start(now);
    sources.push(oscillator);
  }

  const warmth = ctx.createOscillator();
  warmth.type = "sine";
  warmth.frequency.value = root / 2;
  const warmthLevel = ctx.createGain();
  warmthLevel.gain.value = settings.warmth * .24;
  warmth.connect(warmthLevel).connect(filter);
  warmth.start(now);
  sources.push(warmth);

  const dry = ctx.createGain();
  dry.gain.value = 1 - settings.reverb * .35;
  const convolver = ctx.createConvolver();
  convolver.buffer = reverbImpulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = settings.reverb * .7;
  filter.connect(master);
  master.connect(dry).connect(ctx.destination);
  master.connect(convolver).connect(wet).connect(ctx.destination);
  lfo.start(now);
  sources.push(lfo);
  activeDrone = { master, sources };
  if (activeMode === "drone") document.querySelector("#play").innerHTML = "■ stop drone <kbd>space</kbd>";
}

function renderEngineTransport(state) {
  const button = document.querySelector("#engineToggle");
  if (!button) return;
  button.textContent = state === "continuous" ? "■ stop continuous" : "▶ start continuous";
}

const engineController = EngineSynth.createController(
  audioContext,
  () => readSettings("engine"),
  renderEngineTransport,
);

async function startEngine(timed = true) {
  return engineController.start(timed);
}

function stopEngine(spinDown) {
  engineController.stop(spinDown);
}

function play(mode = activeMode, settings = readSettings(mode), restart = false) {
  if (mode === "whoosh") playWhoosh(settings);
  else if (mode === "beep") playBeep(settings);
  else if (mode === "piano") playPiano(settings);
  else if (mode === "engine") startEngine(true);
  else if (activeDrone && !restart) stopDrone();
  else startDrone(settings);
}

function switchMode(mode) {
  if (activeMode === "drone" && mode !== "drone") stopDrone();
  if (activeMode === "engine" && mode !== "engine") stopEngine();
  activeMode = mode;
  document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  document.querySelectorAll("[data-workspace]").forEach((panel) => {
    const active = panel.dataset.workspace === mode;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  document.querySelector("#title").textContent = mode === "drone" ? "hopeful drone designer" : mode === "engine" ? "engine whirr auditions" : `${mode} designer`;
  document.querySelector("#play").innerHTML = `▶ ${mode === "engine" ? "timed play" : `play ${mode}`} <kbd>space</kbd>`;
  document.querySelector("#soundName").placeholder = `${mode} name`;
}

function loadSaved() {
  let sounds;
  try { sounds = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []; }
  catch { sounds = []; }
  if (!Array.isArray(sounds)) sounds = [];
  if (!localStorage.getItem(DESCENDING_PIANO_MIGRATION_KEY)) {
    if (!sounds.some((sound) => sound.id === DESCENDING_PIANO_SOUND.id)) sounds.unshift(DESCENDING_PIANO_SOUND);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sounds));
    localStorage.setItem(DESCENDING_PIANO_MIGRATION_KEY, "1");
  }
  return sounds;
}

function persistSaved() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSounds));
}

function copyJson(sound, button) {
  const json = JSON.stringify({ schema: "signal-lab/v1", type: sound.type, name: sound.name, parameters: sound.parameters }, null, 2);
  const fallback = () => {
    const area = document.createElement("textarea");
    area.value = json;
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  };
  navigator.clipboard?.writeText(json).catch(fallback) ?? fallback();
  const previous = button.textContent;
  button.textContent = "copied";
  setTimeout(() => { button.textContent = previous; }, 900);
}

function playSaved(sound) {
  switchMode(sound.type);
  const parameters = sound.type === "engine" ? EngineSynth.normalizeSettings(sound.parameters) : sound.parameters;
  setSettings(sound.type, parameters);
  play(sound.type, parameters, true);
}

function moveSavedSound(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= savedSounds.length) return;
  [savedSounds[index], savedSounds[target]] = [savedSounds[target], savedSounds[index]];
  persistSaved();
  renderSaved();
}

function renderSaved() {
  const list = document.querySelector("#savedList");
  list.replaceChildren();
  if (!savedSounds.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No saved sounds yet.";
    list.append(empty);
    return;
  }
  savedSounds.forEach((sound, index) => {
    const row = document.createElement("div");
    row.className = "saved-sound";
    const type = document.createElement("span");
    type.className = "sound-type";
    const shortcut = index < 10 ? (index === 9 ? "0" : String(index + 1)) : "·";
    type.textContent = `${shortcut} / ${sound.type}`;
    const name = document.createElement("strong");
    name.textContent = sound.name;
    const summary = document.createElement("span");
    summary.className = "sound-summary";
    summary.textContent = sound.type === "whoosh"
      ? `${sound.parameters.noiseColor} · ${sound.parameters.duration}s · ${sound.parameters.startFreq}→${sound.parameters.endFreq} Hz`
      : sound.type === "beep"
        ? `${sound.parameters.wave} · ${sound.parameters.duration}s · ${sound.parameters.startFreq}→${sound.parameters.endFreq} Hz`
        : sound.type === "drone"
          ? `${sound.parameters.harmony} · ${sound.parameters.wave} · ${sound.parameters.voices} voices`
          : sound.type === "engine"
            ? `${sound.parameters.direction} · ${Math.round(sound.parameters.speed * 100)}% speed · ${Math.round(sound.parameters.power * 100)}% power · ${sound.parameters.duration}s`
            : `${sound.parameters.sequence?.map(Number).join(" → ") ?? sound.parameters.root} Hz · ${sound.parameters.decay}s · ${Math.round(sound.parameters.velocity * 100)}% velocity`;
    const actions = document.createElement("div");
    const playButton = document.createElement("button");
    playButton.textContent = "play";
    playButton.addEventListener("click", () => playSaved(sound));
    const upButton = document.createElement("button");
    upButton.textContent = "↑";
    upButton.title = "Move up";
    upButton.disabled = index === 0;
    upButton.addEventListener("click", () => moveSavedSound(index, -1));
    const downButton = document.createElement("button");
    downButton.textContent = "↓";
    downButton.title = "Move down";
    downButton.disabled = index === savedSounds.length - 1;
    downButton.addEventListener("click", () => moveSavedSound(index, 1));
    const copyButton = document.createElement("button");
    copyButton.textContent = "copy json";
    copyButton.addEventListener("click", () => copyJson(sound, copyButton));
    const deleteButton = document.createElement("button");
    deleteButton.textContent = "delete";
    deleteButton.addEventListener("click", () => {
      savedSounds.splice(index, 1);
      persistSaved();
      renderSaved();
    });
    actions.append(playButton, upButton, downButton, copyButton, deleteButton);
    row.append(type, name, summary, actions);
    list.append(row);
  });
}

for (const panel of document.querySelectorAll("[data-workspace]")) {
  for (const input of panel.querySelectorAll("[data-param]")) {
    input.addEventListener("input", () => {
      updateOutputs(panel.dataset.workspace);
      if (panel.dataset.workspace === "engine") {
        const key = input.dataset.param;
        const value = input.type === "range" ? Number(input.value) : input.value;
        if (key === "direction" && ["continuous", "timed"].includes(engineController.getState())) startEngine(engineController.getState() === "timed");
        else if (!['duration', 'spinUp', 'spinDown', 'direction'].includes(key)) engineController.update({ [key]: value });
        if (key === "detune") updateOutputs("engine");
        document.querySelectorAll("[data-ratchet-only]").forEach((element) => { element.hidden = rawSettings("engine").direction !== "ratchet"; });
      }
    });
    if (input.type === "range") {
      input.addEventListener("pointerup", () => input.blur());
      input.addEventListener("change", () => input.blur());
    }
  }
  panel.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      setSettings(panel.dataset.workspace, presets[panel.dataset.workspace][button.dataset.preset]);
      play(panel.dataset.workspace, readSettings(panel.dataset.workspace), true);
    });
  });
}

document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => switchMode(button.dataset.mode)));
document.querySelector("#play").addEventListener("click", () => play());
document.querySelector("#engineToggle").addEventListener("click", () => {
  if (engineController.getState() === "continuous") engineController.stopContinuous();
  else startEngine(false);
});
document.querySelector("#save").addEventListener("click", () => {
  const nameInput = document.querySelector("#soundName");
  const name = nameInput.value.trim() || `${activeMode} ${savedSounds.filter((sound) => sound.type === activeMode).length + 1}`;
  savedSounds.unshift({ id: crypto.randomUUID?.() ?? String(Date.now()), type: activeMode, name, parameters: readSettings() });
  persistSaved();
  renderSaved();
  nameInput.value = "";
  nameInput.blur();
});
window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
  const isTyping = event.target instanceof HTMLInputElement && event.target.type === "text";
  if (isTyping || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;

  if (/^[0-9]$/.test(event.key)) {
    const index = event.key === "0" ? 9 : Number(event.key) - 1;
    if (savedSounds[index]) {
      event.preventDefault();
      playSaved(savedSounds[index]);
    }
    return;
  }

  if (event.code === "Space" && !(event.target instanceof HTMLButtonElement)) {
    event.preventDefault();
    play();
  }
});

setSettings("whoosh", presets.whoosh.soft);
setSettings("beep", presets.beep.clean);
setSettings("drone", presets.drone.morning);
setSettings("piano", presets.piano.natural);
setSettings("engine", presets.engine.servo);
document.querySelectorAll("[data-ratchet-only]").forEach((element) => { element.hidden = true; });
switchMode("whoosh");
renderSaved();
window.addEventListener("pagehide", () => {
  stopEngine(0);
  stopDrone(true);
});
