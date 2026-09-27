import type {Span} from './cues';
import {SR, Sine, Svf, samples} from './dsp';
import {keyClick, type Mix, type Route} from './voices';

type Mode = [hz: number, decay: number, gain: number];
/**
 * A keyboard as a physical model: a keystroke is a contact tick, a bottom-out that rings the case
 * and plate modes over a desk thump, then a quieter key-up. The spacebar rings lower and rattles.
 */
export type Keyboard = {
  id: string;
  title: string;
  /** Keystrokes per second within a word. */
  rate: number;
  /** Contact tick: band-passed noise centre, q and 1/e decay in seconds. */
  tick: [hz: number, q: number, decay: number];
  /** Case and plate resonances rung by the bottom-out. */
  modes: Mode[];
  /** Desk thump under the bottom-out. */
  thump: Mode;
  /** Seconds from the contact tick to the bottom-out; 0 is a single hit. */
  travel: number;
  /** Key-up level against the key-down. */
  up: number;
  /** A buckling spring's own ring, on press and release. */
  spring?: Mode[];
  gain: number;
};

export const KEYBOARDS: Record<string, Keyboard> = Object.fromEntries(([
  {id: 'laptop', title: 'Laptop (scissor switches)', rate: 13, tick: [4200, 1.1, .0018], travel: 0, up: .4, gain: 2.7,
    modes: [[1850, .005, .35], [2900, .0035, .3], [4700, .0025, .15]], thump: [210, .006, .25]},
  {id: 'thock', title: 'Mechanical, lubed linear (thock)', rate: 12, tick: [1600, .8, .0012], travel: .002, up: .22, gain: .95,
    modes: [[410, .02, .9], [630, .014, .55], [1120, .008, .3], [2300, .004, .12]], thump: [135, .014, .7]},
  {id: 'clack', title: 'Mechanical, tactile in aluminium (clack)', rate: 12, tick: [2800, 1.2, .0016], travel: .003, up: .55, gain: 1.45,
    modes: [[1650, .011, .6], [2400, .009, .5], [3500, .006, .3], [5900, .025, .05]], thump: [190, .01, .35]},
  {id: 'spring', title: 'Buckling spring (IBM Model M)', rate: 10, tick: [3200, 1.4, .0022], travel: .012, up: .5, gain: 1.1,
    modes: [[900, .012, .5], [1700, .009, .45], [2600, .006, .3]], thump: [160, .016, .6],
    spring: [[3150, .035, .12], [4870, .028, .08], [6230, .02, .05]]},
  {id: 'membrane', title: 'Soft office membrane', rate: 11, tick: [1300, .7, .0028], travel: 0, up: .12, gain: 1.7,
    modes: [[270, .012, .6], [880, .007, .3], [1600, .004, .12]], thump: [115, .012, .55]},
] satisfies Keyboard[]).map(keyboard => [keyboard.id, keyboard]));

const noise = (mix: Mix) => mix.random() * 2 - 1;
// Each key's fixed offset, so a repeated letter sounds the same key again.
const identity = (key: number) => { const x = Math.sin(key * 12.9898 + 4.1) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };

/** One keystroke, key-down to key-up. `key` < 0 is the spacebar. */
export function keystroke(mix: Mix, time: number, keyboard: Keyboard, velocity: number, route: Route, key: number) {
  const space = key < 0, hold = (space ? .1 : .07) + mix.random() * .035, ring = space ? 1.7 : 1;
  const pitch = space ? .72 : 1 + .05 * identity(key), out = new Float32Array(samples(hold + .14));
  const hit = (at: number, level: number, bright: number, parts: {tick?: boolean; body?: boolean; spring?: boolean}) => {
    const start = samples(at), filter = new Svf(), thump = new Sine();
    const excite = (modes: Mode[]) => modes.map(([hz, decay, gain]) => ({osc: new Sine(mix.random()), hz: hz * pitch * bright * (1 + (mix.random() - .5) * .02), decay: decay * ring, gain}));
    const modes = [...parts.body ? excite(keyboard.modes) : [], ...parts.spring && keyboard.spring ? excite(keyboard.spring) : []];
    const [tickHz, q, tickDecay] = keyboard.tick, [thumpHz, thumpDecay, thumpGain] = keyboard.thump;
    for (let i = 0; start + i < out.length; i++) {
      const t = i / SR;
      filter.process(noise(mix), tickHz * bright, q);
      let value = parts.tick ? filter.bp * Math.exp(-t / tickDecay) : 0;
      for (const mode of modes) value += mode.osc.next(mode.hz) * Math.exp(-t / mode.decay) * mode.gain;
      if (parts.body) value += thump.next(thumpHz * pitch * (1 + .4 * Math.exp(-t / .004))) * Math.exp(-t / (thumpDecay * ring)) * thumpGain * (bright > 1 ? .25 : 1);
      // A 0.15 ms onset keeps the modes from starting on a step.
      out[start + i] += value * (1 - Math.exp(-t / .00015)) * level;
    }
  };
  if (keyboard.travel) hit(0, .45, 1.1, {tick: true, spring: true});
  hit(keyboard.travel, 1, 1, {tick: true, body: true, spring: !keyboard.travel});
  // The spacebar's stabiliser wire rattles just after it bottoms out.
  if (space) [.005, .011].forEach((gap, i) => hit(keyboard.travel + gap, .3 - i * .12, 1.2, {tick: true, body: true}));
  hit(hold, keyboard.up * (.8 + mix.random() * .3), 1.12, {tick: true, body: true, spring: true});
  mix.emit(time, {...route, gain: (route.gain ?? 1) * velocity * keyboard.gain * .42}, out);
  mix.count('keystroke');
}

/** Human typing: words of two to six letters and a space, log-normal gaps around the keyboard's rate. */
export function typeOut(mix: Mix, window: Span, keyboard: Keyboard, velocity: number, route: Route) {
  const end = window.at + window.duration;
  for (let time = window.at + .015, letters = 2 + Math.floor(mix.random() * 5); time < end - .03;) {
    const space = letters === 0, key = space ? -1 : Math.floor(mix.random() * 30);
    // Keys pan by keyboard column, a little either side of the route.
    keystroke(mix, time, keyboard, velocity * (space ? 1.05 : .8 + mix.random() * .3), {...route, pan: (route.pan ?? 0) + (space ? 0 : (key % 10 / 9 - .5) * .3)}, key);
    letters = space ? 2 + Math.floor(mix.random() * 5) : letters - 1;
    time += Math.exp((mix.random() + mix.random() - 1) * .4) / keyboard.rate * (space ? 1.3 : 1);
  }
}

/** The agent window's typing: `mix.keyboard` when one is chosen, else the original low-profile click at ~22 Hz. */
export function typing(mix: Mix, windows: readonly Span[], route: Route, [low, spread]: [number, number]) {
  if (!mix.typingEnabled) return;
  for (const window of windows) {
    if (mix.keyboard) { typeOut(mix, window, mix.keyboard, low + spread / 2, route); continue; }
    for (let t = 0; t < window.duration; ) {
      keyClick(mix, window.at + t, low + mix.random() * spread, {...route, pan: (mix.random() - .5) * .3});
      t += (1 / 22) * (.7 + mix.random() * .6);
    }
  }
}
