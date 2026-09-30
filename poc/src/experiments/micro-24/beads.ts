import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import type {Flow3Playback} from './sample';

export const BEAD_ORDER = ['opus', 'sonnet', 'flow', 'sol', 'gemini', 'luna'] as const;
export const DEFAULT_BEAD_STAGGER_SECONDS = .11;
export const NARRATED_BEAD_ORDER = ['opus', 'sonnet', 'sol', 'gemini', 'luna', 'flow'] as const;

// Reuse DialKit's easing evaluator, not CSS animation or a wall-clock timer.
const easing = computeStaticTimeline(parseTimelineConfig({bead: {
  at: 0, duration: 1, from: {progress: 0}, to: {progress: 1},
  transition: {type: 'easing', duration: 1, ease: [.45, 0, .55, 1]},
}}), {}).clips[0];

/** Large gaps clamp so all six beads keep at least 50ms of travel; the score's drop cues share this. */
export function beadStagger(barDuration: number, staggerSeconds = DEFAULT_BEAD_STAGGER_SECONDS) {
  const duration = Math.max(.05, barDuration);
  const requestedGap = Number.isFinite(staggerSeconds) ? staggerSeconds : DEFAULT_BEAD_STAGGER_SECONDS;
  return {duration, gap: Math.max(0, Math.min(requestedGap, (duration - .05) / (BEAD_ORDER.length - 1)))};
}

/** The entire stagger fits inside the one authored bar, even after resizing.
 * The dial is the gap between beads in seconds. With the default linear bar,
 * each bead gets the requested smooth curve and starts exactly one gap later.
 * Changing the bar's curve/endpoints warps this group clock via clip.current.
 */
export function beadProgress(playback: Flow3Playback, staggerSeconds = DEFAULT_BEAD_STAGGER_SECONDS, flowRevealAt?: number) {
  const {duration, gap} = beadStagger(playback.timing.beadsEntry.duration, staggerSeconds);
  const travel = duration - gap * (BEAD_ORDER.length - 1);
  const elapsed = playback.progress.beadsEntry * duration;
  const order = flowRevealAt === undefined ? BEAD_ORDER : NARRATED_BEAD_ORDER;
  return Object.fromEntries(order.map((id, index) => {
    // Only the narrated composition holds flow-1 for its spoken cue. Peers keep
    // the authored group clock/curve and travel duration, with no empty slot.
    // Waiting for the resolved group end also keeps Flow last after bar edits.
    const phase = id === 'flow' && flowRevealAt !== undefined
      ? (playback.time - Math.max(flowRevealAt, playback.timing.beadsEntry.at + duration)) / travel
      : (elapsed - index * gap) / travel;
    const current = computeClipState(easing, phase, phase).current as {progress: number};
    return [id, current.progress];
  })) as Record<typeof BEAD_ORDER[number], number>;
}
