import type {TimelineConfig} from 'dialkit/timeline';

const smooth = [.45, 0, .55, 1] as [number, number, number, number];
const linear = [0, 0, 1, 1] as [number, number, number, number];
const clip = (at: number, duration: number, ease = smooth) => ({
  at, duration,
  from: {progress: 0}, to: {progress: 1},
  transition: {type: 'easing' as const, duration, ease},
});

export const INTRODUCING_FLOW_1_DURATION = 13.3;
export const INTRODUCING_FLOW_1_TIMELINE_ID = 'introducing-flow-1-timeline-v5';
export const INTRODUCING_FLOW_1_TIMELINE = {
  duration: INTRODUCING_FLOW_1_DURATION,
  cloudReveal: clip(.45, .9),
  cloudExit: clip(2.2, 1.51),
  // Camera tracks affect the world only, never the screen-pinned clouds.
  cameraZoom: clip(2.11, 1),
  cameraToBenchmark: clip(2.13, 1.2),
  dotsExit: clip(1.95, .9),
  benchmarkHeading: clip(3.28, .23),
  modelRows: clip(3.49, .25),
  percentageReveal: clip(3.39, .2),
  // Count only after the number layers are fully visible in their masks.
  percentageCountUp: clip(3.59, .4, linear),
  cameraToAnalysis: clip(6.1, .51),
  numberSwap: clip(6.11, .3),
  analysisCountUp: clip(6.42, 1.01, linear),
  barsGrow: clip(6.42, .56),
  analysisHeading: clip(6.35, .45),
  cameraToEngine: clip(8.64, .66),
  moduleActivation: clip(9.2, .19),
  // Loop clocks derive independently from these editable starts.
  engineSpinner: clip(9.35, .8),
  engineLines: clip(9.35, .8),
  coverDescent: clip(9.77, .49),
  coverTint: clip(10.11, .45),
  coverSpinner: clip(10.16, .41),
  // Screen-pinned narrative bars, aligned to title, benchmark, cost, and engine.
  subtitleIntroducing: clip(.45, 2.83, linear),
  subtitleIntelligence: clip(3.28, 2.82, linear),
  subtitleCost: clip(6.1, 2.54, linear),
  subtitleSignals: clip(8.64, 4.66, linear),
} satisfies TimelineConfig;

export const FLOW_ENDPOINT_SCHEDULE = [
  {node: '4773:10504', time: 1.5, label: 'Flow-1 field'},
  {node: '4773:6390', time: 5.6, label: 'benchmark percentages'},
  {node: '4773:10843', time: 8.3, label: 'trace analysis'},
  {node: '4773:9034', time: 9.5, label: 'open engine'},
  {node: '4773:8257', time: 10.7, label: 'active engine'},
  {node: '4773:8666', time: 11.1, label: 'closed cover'},
] as const;

export type FlowClipKey = Exclude<keyof typeof INTRODUCING_FLOW_1_TIMELINE, 'duration'>;
export const FLOW_CLIP_KEYS = Object.keys(INTRODUCING_FLOW_1_TIMELINE)
  .filter(key => key !== 'duration') as FlowClipKey[];
