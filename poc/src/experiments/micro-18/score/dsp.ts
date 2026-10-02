/** Pure offline DSP for the Ultimate 3 score. No Web Audio: every sample is a function of the inputs. */
export const SR = 48_000;

export type Rng = () => number;
export const seeded = (seed: number): Rng => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
};

export const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
export const mtof = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export const db = (decibels: number) => 10 ** (decibels / 20);
export const toDb = (gain: number) => 20 * Math.log10(Math.max(gain, 1e-12));
export const seconds = (samples: number) => samples / SR;
export const samples = (time: number) => Math.round(time * SR);

/** Equal-power pan law, -1 (left) .. 1 (right). */
export const panGains = (pan: number): [number, number] => {
  const angle = (clamp(pan, -1, 1) + 1) * Math.PI / 4;
  return [Math.cos(angle), Math.sin(angle)];
};

export class Stereo {
  readonly l: Float32Array;
  readonly r: Float32Array;
  constructor(readonly length: number) { this.l = new Float32Array(length); this.r = new Float32Array(length); }
}

/** Simper/Cytomic trapezoidal state-variable filter; stable under per-sample cutoff modulation. */
export class Svf {
  private ic1 = 0; private ic2 = 0;
  lp = 0; bp = 0; hp = 0;
  process(input: number, hz: number, q = .707) {
    const g = Math.tan(Math.PI * clamp(hz, 10, SR * .45) / SR), k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = input - this.ic2, v1 = a1 * this.ic1 + a2 * v3, v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2; this.bp = v1; this.hp = input - k * v1 - v2;
    return v2;
  }
}

export class OnePole {
  private y = 0;
  constructor(private coefficient: number) {}
  static lowpass(hz: number) { return new OnePole(1 - Math.exp(-2 * Math.PI * hz / SR)); }
  set(hz: number) { this.coefficient = 1 - Math.exp(-2 * Math.PI * hz / SR); }
  process(input: number) { this.y += this.coefficient * (input - this.y); return this.y; }
}

const blep = (phase: number, step: number) => {
  if (phase < step) { const t = phase / step; return t + t - t * t - 1; }
  if (phase > 1 - step) { const t = (phase - 1) / step; return t * t + t + t + 1; }
  return 0;
};

/** Band-limited sawtooth; `phase` is carried by the caller so voices can glide. */
export class Saw {
  phase: number;
  constructor(phase = 0) { this.phase = phase; }
  next(hz: number) {
    const step = hz / SR;
    const value = 2 * this.phase - 1 - blep(this.phase, step);
    this.phase += step; if (this.phase >= 1) this.phase -= 1;
    return value;
  }
}

export class Sine {
  phase: number;
  constructor(phase = 0) { this.phase = phase; }
  next(hz: number) {
    const value = Math.sin(2 * Math.PI * this.phase);
    this.phase += hz / SR; if (this.phase >= 1) this.phase -= 1;
    return value;
  }
}

/** Soft attack, exponential decay; `tau` is the 1/e decay time in seconds. */
export const pluckEnv = (t: number, attack: number, tau: number) =>
  t < 0 ? 0 : t < attack ? Math.sin(t / attack * Math.PI / 2) : Math.exp(-(t - attack) / tau);

/** Raised-cosine attack/sustain/release gate. */
export const gateEnv = (t: number, attack: number, hold: number, release: number) => {
  if (t < 0) return 0;
  if (t < attack) return .5 - .5 * Math.cos(Math.PI * t / attack);
  if (t < attack + hold) return 1;
  const r = t - attack - hold;
  return r < release ? .5 + .5 * Math.cos(Math.PI * r / release) : 0;
};

/** Short release applied to any buffer that must end at a hard sample boundary. */
export const fadeTail = (buffer: Float32Array, fadeSamples: number) => {
  const start = Math.max(0, buffer.length - fadeSamples);
  for (let index = start; index < buffer.length; index++) buffer[index] *= (buffer.length - index) / (buffer.length - start);
};

class Allpass {
  private buffer: Float32Array; private index = 0;
  constructor(length: number, private gain: number) { this.buffer = new Float32Array(length); }
  process(input: number) {
    const delayed = this.buffer[this.index];
    const output = delayed - this.gain * input;
    this.buffer[this.index] = input + this.gain * output;
    this.index = (this.index + 1) % this.buffer.length;
    return output;
  }
}

export type ReverbOptions = {rt60: number; predelay: number; damping: number; size: number; lowCut?: number};

/** Eight-line feedback delay network with input diffusion and a Hadamard mixing matrix. */
export function reverb(input: Stereo, options: ReverbOptions): Stereo {
  const output = new Stereo(input.length);
  const lengths = [31.7, 37.9, 41.3, 47.1, 53.3, 59.9, 67.7, 73.1].map(ms => Math.round(ms * options.size * SR / 1000));
  const lines = lengths.map(length => new Float32Array(length));
  const cursors = lengths.map(() => 0);
  const gains = lengths.map(length => 10 ** (-3 * length / (options.rt60 * SR)));
  const damps = lengths.map(() => OnePole.lowpass(options.damping));
  const diffusers = [142, 107, 379, 277].map((length, i) => new Allpass(Math.round(length * options.size), i < 2 ? .72 : .64));
  const predelay = Math.max(1, samples(options.predelay));
  const pre = new Float32Array(predelay); let preIndex = 0;
  const lowCut = new Svf();
  const read = new Float64Array(8);
  for (let n = 0; n < input.length; n++) {
    let x = pre[preIndex]; pre[preIndex] = (input.l[n] + input.r[n]) * .5; preIndex = (preIndex + 1) % predelay;
    lowCut.process(x, options.lowCut ?? 180, .6); x = lowCut.hp;
    for (const diffuser of diffusers) x = diffuser.process(x);
    for (let i = 0; i < 8; i++) read[i] = lines[i][cursors[i]];
    // Fast Walsh–Hadamard, normalized, keeps the network lossless before per-line decay.
    for (let h = 1; h < 8; h <<= 1) for (let i = 0; i < 8; i += h << 1) for (let j = i; j < i + h; j++) {
      const a = read[j], b = read[j + h]; read[j] = a + b; read[j + h] = a - b;
    }
    let left = 0, right = 0;
    for (let i = 0; i < 8; i++) {
      const value = read[i] / Math.sqrt(8);
      const feedback = damps[i].process(value) * gains[i];
      const tap = lines[i][cursors[i]];
      lines[i][cursors[i]] = feedback + x * (i % 2 ? -.35 : .35);
      cursors[i] = (cursors[i] + 1) % lines[i].length;
      if (i % 2) right += tap; else left += tap;
    }
    output.l[n] = left * .5; output.r[n] = right * .5;
  }
  return output;
}

/** Ping-pong delay with a darkening feedback path. */
export function pingPong(input: Stereo, time: number, feedback: number, damping: number): Stereo {
  const output = new Stereo(input.length);
  const length = samples(time);
  const left = new Float32Array(length), right = new Float32Array(length);
  const dampLeft = OnePole.lowpass(damping), dampRight = OnePole.lowpass(damping);
  let index = 0;
  for (let n = 0; n < input.length; n++) {
    const tapLeft = left[index], tapRight = right[index];
    left[index] = (input.l[n] + input.r[n]) * .5 + dampRight.process(tapRight) * feedback;
    right[index] = dampLeft.process(tapLeft) * feedback;
    index = (index + 1) % length;
    output.l[n] = tapLeft; output.r[n] = tapRight;
  }
  return output;
}

function slidingMin(values: Float32Array, radius: number) {
  const output = new Float32Array(values.length);
  const deque = new Int32Array(values.length); let head = 0, tail = 0;
  for (let n = 0; n < values.length + radius; n++) {
    if (n < values.length) {
      while (tail > head && values[deque[tail - 1]] >= values[n]) tail--;
      deque[tail++] = n;
    }
    const center = n - radius;
    if (center < 0) continue;
    while (deque[head] < center - radius) head++;
    output[center] = values[deque[head]];
  }
  return output;
}

/** Offline look-around brickwall: every smoothed gain is ≤ the gain its own sample needs. */
export function limit(mix: Stereo, ceiling: number, releaseSeconds = .12) {
  const radius = samples(.004);
  const needed = new Float32Array(mix.length);
  for (let n = 0; n < mix.length; n++) {
    const peak = Math.max(Math.abs(mix.l[n]), Math.abs(mix.r[n]));
    needed[n] = peak > ceiling ? ceiling / peak : 1;
  }
  const floor = slidingMin(needed, radius * 2);
  const release = 1 - Math.exp(-1 / (releaseSeconds * SR));
  let sum = 0, envelope = 1, reduction = 1;
  for (let n = 0; n < mix.length + radius; n++) {
    if (n < mix.length) sum += floor[n];
    if (n - 2 * radius - 1 >= 0) sum -= floor[n - 2 * radius - 1];
    const center = n - radius;
    if (center < 0) continue;
    const width = Math.min(n, mix.length - 1) - Math.max(0, center - radius) + 1;
    const smooth = Math.min(sum / width, floor[center]);
    envelope = smooth < envelope ? smooth : envelope + (smooth - envelope) * release;
    reduction = Math.min(reduction, envelope);
    mix.l[center] *= envelope; mix.r[center] *= envelope;
  }
  return toDb(reduction);
}

class Biquad {
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(private b: readonly number[], private a: readonly number[]) {}
  process(x: number) {
    const y = this.b[0] * x + this.b[1] * this.x1 + this.b[2] * this.x2 - this.a[1] * this.y1 - this.a[2] * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** RBJ cookbook shelf (`gain` in dB, shelf slope 1). */
function shelf(kind: 'low' | 'high', hz: number, gain: number) {
  const A = 10 ** (gain / 40), w = 2 * Math.PI * hz / SR, cos = Math.cos(w), alpha = Math.sin(w) / 2 * Math.SQRT2, root = 2 * Math.sqrt(A) * alpha;
  const sign = kind === 'low' ? 1 : -1;
  const b = [A * ((A + 1) - sign * (A - 1) * cos + root), sign * 2 * A * ((A - 1) - sign * (A + 1) * cos), A * ((A + 1) - sign * (A - 1) * cos - root)];
  const a = [(A + 1) + sign * (A - 1) * cos + root, -sign * 2 * ((A - 1) + sign * (A + 1) * cos), (A + 1) + sign * (A - 1) * cos - root];
  return new Biquad(b.map(v => v / a[0]), a.map(v => v / a[0]));
}

/** Master tone: clear the sub rumble laptops can't play, lift the glass. */
export function masterEq(mix: Stereo, options: {highpass: number; lowShelf: [number, number]; highShelf: [number, number]}) {
  for (const channel of [mix.l, mix.r]) {
    const low = shelf('low', ...options.lowShelf), high = shelf('high', ...options.highShelf), cut = new Svf();
    for (let n = 0; n < channel.length; n++) { cut.process(channel[n], options.highpass, .707); channel[n] = high.process(low.process(cut.hp)); }
  }
}

/** ITU-R BS.1770-4 integrated loudness (48 kHz K-weighting, gated). */
export function integratedLufs(mix: Stereo) {
  const weighted = [mix.l, mix.r].map(channel => {
    const shelf = new Biquad([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, .73248077421585]);
    const highpass = new Biquad([1, -2, 1], [1, -1.99004745483398, .99007225036621]);
    const out = new Float64Array(channel.length);
    for (let n = 0; n < channel.length; n++) { const y = highpass.process(shelf.process(channel[n])); out[n] = y * y; }
    return out;
  });
  const block = samples(.4), hop = samples(.1);
  const powers: number[] = [];
  for (let start = 0; start + block <= mix.length; start += hop) {
    let sum = 0;
    for (const channel of weighted) for (let n = start; n < start + block; n++) sum += channel[n];
    powers.push(sum / block);
  }
  const loudness = (power: number) => -.691 + 10 * Math.log10(Math.max(power, 1e-20));
  const absolute = powers.filter(power => loudness(power) > -70);
  if (!absolute.length) return -Infinity;
  const relativeGate = loudness(absolute.reduce((a, b) => a + b, 0) / absolute.length) - 10;
  const gated = absolute.filter(power => loudness(power) > relativeGate);
  return loudness(gated.reduce((a, b) => a + b, 0) / gated.length);
}

/** Peak of a 4× linearly-interpolated signal: a cheap, conservative-enough true-peak estimate. */
export function truePeak(mix: Stereo) {
  let peak = 0;
  for (const channel of [mix.l, mix.r]) for (let n = 1; n < channel.length; n++) {
    const a = channel[n - 1], b = channel[n];
    for (let k = 0; k < 4; k++) peak = Math.max(peak, Math.abs(a + (b - a) * k / 4));
  }
  return peak;
}
