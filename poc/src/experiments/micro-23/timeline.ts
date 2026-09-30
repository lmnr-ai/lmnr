import type {DialValue} from 'dialkit';
import type {TimelineConfig} from 'dialkit/timeline';

export const MICRO_23_TIMELINE_ID = 'micro-animation-23-timeline-v1';
export const MICRO_23_CONTROLS_ID = 'micro-animation-23-appearance-v1';
const smooth: [number, number, number, number] = [.45, 0, .55, 1];
const linear: [number, number, number, number] = [0, 0, 1, 1];
const clip = (at: number, duration: number, ease = smooth) => ({
  at, duration, from: {progress: 0}, to: {progress: 1},
  transition: {type: 'easing' as const, duration, ease},
});

/** Each dot bar spans the FIRST start through the LAST completed entrance. */
export const MICRO_23_TIMELINE = {
  gridShrink: clip(.07, .78, [.3, 0, .55, 1]),
  orangeDots: clip(.5, .19, linear),
  blueDots: clip(1.48, 1.04, linear),
  gptLabel: clip(.51, .2, [.2, .62, .55, .96]),
  flowLabel: clip(2.47, .24),
  gptNumber: clip(.5, .21, [.1, .2, .6, .92]),
  flowNumber: clip(2.47, .24, [.1, .2, .46, 1]),
  headlineReveal: clip(.41, .42),
  // Legacy persisted key; now drives the card slide-out, not opacity.
  headlineFadeOut: clip(1.58, .19, linear),
  returnToGrid: clip(3.2, .76),
} satisfies TimelineConfig;
export type Micro23Key = keyof typeof MICRO_23_TIMELINE;
export const MICRO_23_KEYS = Object.keys(MICRO_23_TIMELINE) as Micro23Key[];
export const MICRO_23_DEFAULTS = {
  startCellSize: 60, endCellSize: 20, dotDiameter: 6,
  dotDuration: .25, numberSlide: 80, hold: 2,
  gridColor: '#1f1f1f', orangeColor: '#fb9d0e', blueColor: '#a8caff',
};
export type Micro23Controls = typeof MICRO_23_DEFAULTS;
/** Native flattened DialKit values retain from/to, transitions and preset edits. */
export type Micro23Props = {values?: Record<string, DialValue>; controls?: Partial<Micro23Controls>};

export function normalizeMicro23Controls(input: Partial<Micro23Controls> = {}): Micro23Controls {
  const bounded = (key: keyof Micro23Controls, min: number, max: number) => {
    const value = input[key];
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : MICRO_23_DEFAULTS[key] as number;
  };
  const color = (key: 'gridColor' | 'orangeColor' | 'blueColor') =>
    typeof input[key] === 'string' && /^#[\da-f]{6}$/i.test(input[key]!) ? input[key]! : MICRO_23_DEFAULTS[key];
  return {
    startCellSize: bounded('startCellSize', 20, 120), endCellSize: bounded('endCellSize', 10, 60),
    dotDiameter: bounded('dotDiameter', 1, 16), dotDuration: bounded('dotDuration', .01, 2),
    numberSlide: bounded('numberSlide', 0, 2000), hold: bounded('hold', 0, 10),
    gridColor: color('gridColor'), orangeColor: color('orangeColor'), blueColor: color('blueColor'),
  };
}
