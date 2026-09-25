import type {TimelineConfig} from 'dialkit/timeline';

export const MICRO_02_DURATION = 6;
export const MICRO_02_TIMELINE_ID = 'micro-animation-02-timeline-v3';

const componentClip = (at: number, duration: number) => ({
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

// The master timeline controls absolute placement and duration. Each component
// interprets its normalized progress with its own relative internal timeline.
export const MICRO_02_TIMELINE = {
  duration: MICRO_02_DURATION,
  mainImage: componentClip(0, 5.9),
  portrait: componentClip(2.53, 1.4),
  stats: componentClip(2.72, 3.28),
  rails: componentClip(0.33, 2.97),
  grids: componentClip(0.56, 5.02),
  dots: componentClip(3.08, 0.99),
  paragraph: componentClip(2.27, 2.15),
} satisfies TimelineConfig;

export interface Micro02Progress {
  mainImage: number;
  portrait: number;
  stats: number;
  rails: number;
  grids: number;
  dots: number;
  paragraph: number;
}
