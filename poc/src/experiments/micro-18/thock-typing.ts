/** Dependency-free port of the supplied lubed-linear keyboard model.
 * Fixed 48kHz PCM is shared by live Web Audio and offline export (Web Audio
 * resamples if needed). No peak normalization: the existing mixer owns level.
 */
export const THOCK_SAMPLE_RATE = 48_000;
export const THOCK_MIX_GAIN = .35;
const SR = THOCK_SAMPLE_RATE;
const samples = (time: number) => Math.round(time * SR);
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const seeded = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
};
class Svf {
  private ic1 = 0; private ic2 = 0;
  bp = 0;
  process(input: number, hz: number, q = .707) {
    const g = Math.tan(Math.PI * clamp(hz, 10, SR * .45) / SR), k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = input - this.ic2, v1 = a1 * this.ic1 + a2 * v3, v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2; this.bp = v1;
  }
}
class Sine {
  constructor(private phase = 0) {}
  next(hz: number) {
    const value = Math.sin(2 * Math.PI * this.phase);
    this.phase += hz / SR; if (this.phase >= 1) this.phase -= 1;
    return value;
  }
}
type Mode = readonly [hz: number, decay: number, gain: number];
export const THOCK = {
  tick: [1600, .8, .0012] as Mode,
  modes: [[410, .02, .9], [630, .014, .55], [1120, .008, .3], [2300, .004, .12]] as readonly Mode[],
  thump: [135, .014, .7] as Mode,
  travel: .002, up: .22, gain: .95,
} as const;
const identity = (key: number) => { const x = Math.sin(key * 12.9898 + 4.1) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };

/** Event identity, not playback order/audio-clock time, controls the variation.
 * Seeded words of 2–6 keys followed by a spacebar; seeks cannot change the voice.
 */
export function thockStroke(index: number) {
  const ordinal = Math.max(0, Math.floor(Number.isFinite(index) ? index : 0));
  const random = seeded(0x1a31a);
  let letters = 2 + Math.floor(random() * 5);
  let stroke = {key: 0, velocity: .375, pan: 0, seed: 0};
  for (let i = 0; i <= ordinal; i++) {
    const space = letters === 0, key = space ? -1 : Math.floor(random() * 30);
    stroke = {key, velocity: .375 * (space ? 1.05 : .8 + random() * .3),
      pan: space ? 0 : (key % 10 / 9 - .5) * .3, seed: Math.floor(random() * 4294967296)};
    letters = space ? 2 + Math.floor(random() * 5) : letters - 1;
  }
  return stroke;
}

export function renderThockKeystroke(index: number, tuning: {brightness?: number; body?: number; decay?: number} = {}) {
  const brightness = tuning.brightness ?? 1, bodyGain = tuning.body ?? 1, decayScale = tuning.decay ?? 1;
  const {key, velocity, pan, seed} = thockStroke(index), random = seeded(seed);
  const space = key < 0, hold = (space ? .1 : .07) + random() * .035, ring = (space ? 1.7 : 1) * decayScale;
  const pitch = space ? .72 : 1 + .05 * identity(key), out = new Float32Array(samples(hold + .14 * decayScale));
  const hit = (at: number, level: number, bright: number, body: boolean) => {
    const start = samples(at), filter = new Svf(), thump = new Sine();
    const modes = body ? THOCK.modes.map(([hz, decay, gain]) => ({osc: new Sine(random()),
      hz: hz * pitch * bright * (1 + (random() - .5) * .02), decay: decay * ring, gain})) : [];
    const [tickHz, q, tickDecay] = THOCK.tick, [thumpHz, thumpDecay, thumpGain] = THOCK.thump;
    for (let i = 0; start + i < out.length; i++) {
      const t = i / SR;
      filter.process(random() * 2 - 1, tickHz * bright * brightness, q);
      let value = filter.bp * Math.exp(-t / (tickDecay * decayScale));
      for (const mode of modes) value += mode.osc.next(mode.hz * brightness) * Math.exp(-t / mode.decay) * mode.gain * bodyGain;
      if (body) value += thump.next(thumpHz * pitch * (1 + .4 * Math.exp(-t / .004)))
        * Math.exp(-t / (thumpDecay * ring)) * thumpGain * bodyGain * (bright > 1 ? .25 : 1);
      out[start + i] += value * (1 - Math.exp(-t / .00015)) * level;
    }
  };
  hit(0, .45, 1.1, false);
  hit(THOCK.travel, 1, 1, true);
  if (space) [.005, .011].forEach((gap, i) => hit(THOCK.travel + gap, .3 - i * .12, 1.2, true));
  hit(hold, THOCK.up * (.8 + random() * .3), 1.12, true);
  const gain = velocity * THOCK.gain * .42 * THOCK_MIX_GAIN;
  const angle = (clamp(pan, -1, 1) + 1) * Math.PI / 4;
  const left = new Float32Array(out.length), right = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) {
    left[i] = out[i] * gain * Math.cos(angle); right[i] = out[i] * gain * Math.sin(angle);
  }
  return {left, right};
}
