import {bowed, timpani, type Mix, type Route} from '../voices';

/*
 * Tempesta's technique: every sound is the sampled VSCO string orchestra (solo violin, violin section,
 * celli, pizzicato) plus timpani. These helpers write the virtuoso gestures on top of `bowed()`.
 */

export const G_MINOR = [7, 9, 10, 0, 2, 3, 6], G_MAJOR = [7, 9, 11, 0, 2, 4, 6], E_MINOR = [4, 6, 7, 9, 11, 0, 3];
const classOf = (midi: number) => ((midi % 12) + 12) % 12;

/** The tone `steps` scale steps from `midi` (snapped down into the scale first). */
export function step(scale: readonly number[], midi: number, steps: number) {
  let out = Math.round(midi);
  while (!scale.includes(classOf(out))) out--;
  for (let k = 0; k < Math.abs(steps); k++) do out += Math.sign(steps); while (!scale.includes(classOf(out)));
  return out;
}

/** One détaché/spiccato note: on the string from its transient, short release. */
export function note(mix: Mix, time: number, midi: number, length: number, velocity: number, route: Route, options: {section?: 'violin' | 'violins' | 'celli'; bright?: number; offset?: number; level?: number} = {}) {
  bowed(mix, time, time + length, midi, route, {
    section: options.section ?? 'violin', dynamics: [velocity, velocity * .85], attack: .005, release: Math.min(.14, length * .6 + .03),
    offset: options.offset, bright: options.bright ?? .75, level: options.level,
  });
}

/** A scale run from `from` to `to` across [start, end); `curve` > 1 accelerates into the target. */
export function run(mix: Mix, start: number, end: number, from: number, to: number, scale: readonly number[], velocity: [number, number], route: Route, options: {curve?: number; level?: number} = {}) {
  const notes = [step(scale, from, 0)];
  const direction = Math.sign(to - from);
  while (direction && (direction > 0 ? notes.at(-1)! < to : notes.at(-1)! > to) && notes.length < 64) notes.push(step(scale, notes.at(-1)!, direction));
  const count = notes.length, at = (i: number) => start + (end - start) * (i / count) ** (1 / (options.curve ?? 1));
  notes.forEach((midi, i) => note(mix, at(i), midi, Math.max(.05, (at(i + 1) - at(i)) * 1.3), velocity[0] + (velocity[1] - velocity[0]) * i / Math.max(1, count - 1), route, {level: options.level}));
}

/** A measured trill between `low` and `low + interval`, crescendoing across [start, end). */
export function trill(mix: Mix, start: number, end: number, low: number, interval: number, velocity: [number, number], route: Route, rate = 16) {
  for (let t = start, k = 0; t < end - .02; t += 1 / rate, k++) {
    const p = (t - start) / (end - start);
    note(mix, t, low + (k % 2 ? interval : 0), 1.4 / rate, velocity[0] + (velocity[1] - velocity[0]) * p, route, {offset: .06});
  }
}

/** A timpani roll on `midi` that swells from `velocity[0]` to `velocity[1]`. */
export function roll(mix: Mix, start: number, end: number, midi: number, velocity: [number, number], route: Route) {
  for (let t = start, k = 0; t < end - .01; t += .048, k++) {
    const p = (t - start) / (end - start);
    timpani(mix, t, midi, (velocity[0] + (velocity[1] - velocity[0]) * p ** 1.6) * (k % 2 ? .88 : 1), {...route, pan: k % 2 ? .12 : -.12}, {decay: .5});
  }
}
