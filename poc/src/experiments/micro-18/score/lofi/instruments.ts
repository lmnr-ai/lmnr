import {OnePole, Sine, Svf, mtof, pluckEnv} from '../dsp';
import type {Mix, PianoBank, Route} from '../voices';

/**
 * A dusty Rhodes as a bank every three semitones, so `piano()` and the piano writing play it: a 1:1 FM
 * body whose index sinks into a near-sine, the tine's short ping, and a gentle tremolo baked in.
 */
export const rhodes = (): PianoBank => Array.from({length: 22}, (_, i) => 33 + 3 * i).map(midi => {
  const hz = mtof(midi), data = new Float32Array(48_000 * 7), decay = 3.4 * 2 ** (-(midi - 60) / 26);
  const carrier = new Sine(), modulator = new Sine(), tine = new Sine(), warm = OnePole.lowpass(3800);
  for (let i = 0; i < data.length; i++) {
    const t = i / 48_000;
    const body = carrier.next(hz + modulator.next(hz) * hz * (.2 + .9 * Math.exp(-t / .22)));
    const ping = tine.next(hz * 7.02) * Math.exp(-t / .025) * .12;
    const tremolo = 1 - .14 * (.5 + .5 * Math.sin(2 * Math.PI * 4.2 * t));
    data[i] = warm.process(Math.tanh((body + ping) * 1.4)) * Math.exp(-t / decay) * tremolo * Math.min(1, t / .002) * .12;
  }
  return {midi, data};
});

/** A cross-stick: a woody knock with a short click on top. */
export function rim(mix: Mix, time: number, velocity: number, route: Route) {
  const out = new Float32Array(48_000 * .12), wood = new Sine(), click = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    click.process(mix.random() * 2 - 1, 2400, 1.4);
    out[i] = (wood.next(460) * Math.exp(-t / .018) * .8 + click.bp * Math.exp(-t / .006)) * velocity * .3;
  }
  mix.emit(time, route, out); mix.count('rim');
}

/** A record's surface from `start` to `end`: soft band-limited hiss with sparse crackles and the odd pop. */
export function vinyl(mix: Mix, start: number, end: number, level: number, route: Route) {
  const out = new Float32Array(Math.round((end - start) * 48_000)), hiss = new Svf(), crackle = new Svf();
  let spark = 0, sparkDecay = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    hiss.process(mix.random() * 2 - 1, 3200, .5);
    // ~9 crackles a second, a louder pop every couple of seconds.
    if (mix.random() < 9 / 48_000) { spark = (mix.random() < .12 ? 1 : .25 + .35 * mix.random()) * (mix.random() < .5 ? -1 : 1); sparkDecay = .0004 + mix.random() * .0012; }
    spark *= Math.exp(-1 / (sparkDecay * 48_000));
    crackle.process(spark, 2600, .8);
    out[i] = (hiss.bp * .05 + crackle.bp * .9 + crackle.hp * .25) * level * pluckEnv(t, .8, 1e9) * Math.min(1, (out.length - i) / 48_000);
  }
  mix.emit(start, route, out); mix.count('vinyl');
}
