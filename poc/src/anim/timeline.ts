import {
  parseTimelineConfig,
  computeStaticTimeline,
  computeClipState,
  type TimelineConfig,
} from 'dialkit/timeline';
import type { DialValue } from 'dialkit/store';

/** Tuned overrides straight out of the DialKit dock. */
export type DialValues = Record<string, DialValue>;

/**
 * The single source of truth for the "un-tree everything" beat.
 *
 * Nothing in this file knows about React, Remotion, or a clock. It turns a
 * time in seconds into style values. The tuning app feeds it `timeline.time`
 * from DialKit's transport; Remotion feeds it `frame / fps`. Same numbers.
 */

export const PANEL_ID = 'trace-view';

export const TIMELINE: TimelineConfig = {
  // A minimum editing window. DialKit extends it automatically if a tuned
  // spring settles later, so the render length follows the tuning.
  duration: 2.8,

  /** DEFAULT spans fade out and collapse their row height away. */
  purge: {
    at: 0.2,
    duration: 0.7,
    from: { opacity: 1, squash: 1 },
    to: { opacity: 0, squash: 0 },
    transition: { type: 'easing', duration: 0.55, ease: [0.4, 0, 1, 1] },
  },

  /** Surviving rows slide from their tree indent back to a flat list. */
  flatten: {
    at: 0.6,
    duration: 1,
    from: { indent: 1 },
    to: { indent: 0 },
    transition: { type: 'spring', stiffness: 120, damping: 18, mass: 1 },
  },

  /** Icons shift from uniform grey to purple (LLM) and yellow (TOOL). */
  tint: {
    at: 1.1,
    duration: 0.8,
    from: { mix: 0 },
    to: { mix: 1 },
    transition: { type: 'easing', duration: 0.7, ease: [0.4, 0, 0.2, 1] },
  },

  /** The step numbers rise in once the list has settled. */
  steps: {
    at: 1.5,
    duration: 1,
    from: { y: 6, opacity: 0 },
    to: { y: 0, opacity: 1 },
    transition: { type: 'spring', stiffness: 140, damping: 20, mass: 1 },
  },
};

export interface Sample {
  purge: { opacity: number; squash: number };
  flatten: { indent: number };
  tint: { mix: number };
  steps: { y: number; opacity: number };
}

export interface Sampler {
  /** Timeline length in seconds, after DialKit resolves physics settle times. */
  duration: number;
  /** Pure. Same t always yields the same sample. */
  at(t: number): Sample;
}

/**
 * @param values Tuned overrides from the DialKit dock. Pass `{}` (or the
 *   committed `tuned.json`) to get the values authored in TIMELINE above.
 *   DialKit resolves these over the config defaults, exactly as its own
 *   React adapter does.
 */
export const createSampler = (values: DialValues = {}): Sampler => {
  const parsed = parseTimelineConfig(TIMELINE);
  const { clips, duration } = computeStaticTimeline(parsed, values);

  return {
    duration,
    at: (t) =>
      Object.fromEntries(
        clips.map((clip) => [
          clip.key,
          (computeClipState(clip, t, t) as { current: unknown }).current,
        ]),
      ) as unknown as Sample,
  };
};
