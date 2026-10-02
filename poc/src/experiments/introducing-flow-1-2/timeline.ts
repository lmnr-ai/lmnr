import type {TimelineConfig} from 'dialkit/timeline';
import {INTRODUCING_FLOW_1_TIMELINE as original} from '../introducing-flow-1/timeline';

const clip = (at: number, duration: number, ease: [number, number, number, number] = [.45, 0, .55, 1]) => ({
  at, duration, from: {progress: 0}, to: {progress: 1},
  transition: {type: 'easing' as const, duration, ease},
});

export const FLOW_2_TIMELINE_ID = 'introducing-flow-1-2-timeline-v1';
export const FLOW_2_DURATION = original.duration;
/** Keep the title/engine choreography, replacing only the two statistics scenes.
 * There is deliberately NO camera motion between the two graph poses.
 */
export const FLOW_2_TIMELINE = {
  duration: FLOW_2_DURATION,
  cloudReveal: original.cloudReveal,
  cloudExit: original.cloudExit,
  cameraZoom: original.cameraZoom,
  cameraToBenchmark: original.cameraToBenchmark,
  dotsExit: original.dotsExit,
  benchmarkHeading: original.benchmarkHeading,
  modelPoints: clip(3.49, .4),
  // Retain these existing authoring keys: visibility and string slide-in.
  ballEntry: clip(2.77, .75),
  // Shared entry for both axis containers; retain the existing persistence key.
  xAxisEntry: clip(6.1, .5),
  yAxisExit: clip(8.02, .5),
  xAxisExit: clip(8.08, .5),
  // One linear group clock; beads.ts applies the supplied smooth easing per bead.
  // .85s travel + five .11s gaps = 1.4s for the whole editable bar.
  beadsEntry: clip(2.88, 1.4, [0, 0, 1, 1]),
  graphSpread: clip(5.41, 1.54),
  benchmarkHeadingExit: clip(6.1, .3),
  analysisHeading: original.analysisHeading,
  flowLabel: clip(6.42, .4),
  cameraToEngine: original.cameraToEngine,
  stringExit: clip(original.cameraToEngine.at, original.cameraToEngine.duration),
  moduleActivation: original.moduleActivation,
  engineSpinner: original.engineSpinner,
  engineLines: original.engineLines,
  coverDescent: original.coverDescent,
  coverTint: original.coverTint,
  coverSpinner: original.coverSpinner,
  subtitleIntroducing: original.subtitleIntroducing,
  subtitleIntelligence: original.subtitleIntelligence,
  subtitleCost: original.subtitleCost,
  subtitleSignals: original.subtitleSignals,
} satisfies TimelineConfig;

export type Flow2ClipKey = Exclude<keyof typeof FLOW_2_TIMELINE, 'duration'>;
export const FLOW_2_CLIP_KEYS = Object.keys(FLOW_2_TIMELINE).filter(key => key !== 'duration') as Flow2ClipKey[];
