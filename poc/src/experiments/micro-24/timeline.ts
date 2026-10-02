import type {TimelineConfig} from 'dialkit/timeline';
import {INTRODUCING_FLOW_1_TIMELINE as original} from '../introducing-flow-1/timeline';
import {MICRO_23_TIMELINE, type Micro23Key} from '../micro-23/timeline';

export const MICRO23_TRACKS = {
  gridShrink: 'micro23GridShrink', orangeDots: 'micro23OrangeDots', blueDots: 'micro23BlueDots',
  gptLabel: 'micro23GptLabel', flowLabel: 'micro23FlowLabel', gptNumber: 'micro23GptNumber', flowNumber: 'micro23FlowNumber',
  headlineReveal: 'micro23HeadlineReveal', headlineFadeOut: 'micro23HeadlineFadeOut', returnToGrid: 'micro23ReturnToGrid',
} as const satisfies Record<Micro23Key, string>;
const inserted = Object.fromEntries(Object.entries(MICRO23_TRACKS).map(([key, name]) => {
  const source = MICRO_23_TIMELINE[key as Micro23Key];
  return [name, {...source, at: Number((5.7 + source.at).toFixed(2))}];
})) as Record<typeof MICRO23_TRACKS[Micro23Key], typeof MICRO_23_TIMELINE.gridShrink>;

const clip = (at: number, duration: number, ease: [number, number, number, number] = [.45, 0, .55, 1]) => ({
  at, duration, from: {progress: 0}, to: {progress: 1},
  transition: {type: 'easing' as const, duration, ease},
});

export const FLOW_3_TIMELINE_ID = 'micro-animation-24-timeline-v3';
export const FLOW_3_DURATION = 15.25;
/** Preserve the intelligence scene, then insert the shared traces-per-dollar sequence. */
export const FLOW_3_TIMELINE = {
  duration: FLOW_3_DURATION,
  cloudReveal: original.cloudReveal,
  cloudExit: original.cloudExit,
  cameraZoom: original.cameraZoom,
  cameraToBenchmark: original.cameraToBenchmark,
  dotsExit: original.dotsExit,
  benchmarkHeading: original.benchmarkHeading,
  modelPoints: clip(3.49, .4),
  // Retain these existing authoring keys: visibility and string slide-in.
  ballEntry: clip(2.77, .75),
  // One linear group clock; beads.ts applies the supplied smooth easing per bead.
  // .85s travel + five .11s gaps = 1.4s for the whole editable bar.
  beadsEntry: clip(2.88, 1.4, [0, 0, 1, 1]),
  intelligenceExit: clip(5.15, .35),
  stringExit: clip(5.15, .5),
  // Native tracks, not a nested timeline or independently advancing clock.
  ...inserted,
  // A short empty-grid bridge keeps the restored 60px field readable.
  cameraToEngine: clip(10.05, .66),
  moduleActivation: clip(10.61, .19),
  engineSpinner: clip(10.76, .8),
  engineLines: clip(10.76, .8),
  coverDescent: clip(11.18, .49),
  coverTint: clip(11.52, .45),
  coverSpinner: clip(11.57, .41),
  subtitleIntroducing: original.subtitleIntroducing,
  subtitleIntelligence: clip(3.28, 2.49, [0, 0, 1, 1]),
  subtitleCost: clip(5.77, 4.28, [0, 0, 1, 1]),
  subtitleSignals: clip(10.05, 5.2, [0, 0, 1, 1]),
} satisfies TimelineConfig;

export type Flow3ClipKey = Exclude<keyof typeof FLOW_3_TIMELINE, 'duration'>;
export const FLOW_3_CLIP_KEYS = Object.keys(FLOW_3_TIMELINE).filter(key => key !== 'duration') as Flow3ClipKey[];
