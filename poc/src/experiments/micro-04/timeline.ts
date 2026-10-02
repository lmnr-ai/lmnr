import type {TimelineConfig} from 'dialkit/timeline';

export const MICRO_04_DURATION = 10;
export const MICRO_04_TIMELINE_ID = 'micro-animation-04-timeline-v10';

const EASE_IN_OUT = [0.42, 0, 0.58, 1] as [number, number, number, number];

const clip = (at: number, duration: number) => ({
  at,
  duration,
  from: {progress: 0},
  to: {progress: 1},
  transition: {
    type: 'easing' as const,
    duration,
    ease: [0.45, 0, 0.2, 1] as [number, number, number, number],
  },
});

export const MICRO_04_TIMELINE = {
  duration: MICRO_04_DURATION,
  crosses: clip(0, 0.35),
  lines: clip(0, 1.2),
  loaderReveal: clip(0.78, 1.23),
  loaderSpin: {
    ...clip(0.77, 1),
    loop: 'repeat' as const,
    transition: {type: 'easing' as const, duration: 1, ease: [0, 0, 1, 1] as [number, number, number, number]},
  },
  thinkingWidth: clip(1.82, 1.38),
  rowTwo: clip(2.98, 1.35),
  rowTwoSlide: clip(3.02, 1.12),
  rowThree: clip(4.17, 1.14),
  endCircleScale: clip(4.17, 1.39),
  timer: clip(4.76, 0.05),
  blocksOutro: clip(6, 1.5),
  gridDissolve: clip(6, 0.8),
  shapeMorph: clip(6.38, 1.4),
  logoBlurEnter: {
    ...clip(6.22, 0.85),
    transition: {type: 'easing' as const, duration: 0.85, ease: EASE_IN_OUT},
  },
  logoBlurExit: {
    ...clip(7.06, 0.97),
    transition: {type: 'easing' as const, duration: 0.97, ease: EASE_IN_OUT},
  },
  frameConverge: clip(5.43, 2.8),
} satisfies TimelineConfig;

export interface Micro04Values {
  crosses: number;
  lines: number;
  loaderReveal: number;
  loaderSpin: number;
  thinkingWidth: number;
  rowTwo: number;
  rowTwoSlide: number;
  rowThree: number;
  endCircleScale: number;
  timer: number;
  blocksOutro: number;
  gridDissolve: number;
  shapeMorph: number;
  logoBlurEnter: number;
  logoBlurExit: number;
  frameConverge: number;
}
