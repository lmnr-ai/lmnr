import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import type {Flow2Playback} from './sample';

export const BEAD_ORDER = ['opus', 'sonnet', 'flow', 'sol', 'gemini', 'luna'] as const;
export const DEFAULT_BEAD_STAGGER_SECONDS = .11;

// Reuse DialKit's easing evaluator, not CSS animation or a wall-clock timer.
const easing = computeStaticTimeline(parseTimelineConfig({bead: {
  at: 0, duration: 1, from: {progress: 0}, to: {progress: 1},
  transition: {type: 'easing', duration: 1, ease: [.45, 0, .55, 1]},
}}), {}).clips[0];

/** The entire stagger fits inside the one authored bar, even after resizing.
 * The dial is the gap between beads in seconds. With the default linear bar,
 * each bead gets the requested smooth curve and starts exactly one gap later.
 * Changing the bar's curve/endpoints warps this group clock via clip.current.
 */
export function beadProgress(playback: Flow2Playback, staggerSeconds = DEFAULT_BEAD_STAGGER_SECONDS) {
  const duration = Math.max(.05, playback.timing.beadsEntry.duration);
  const requestedGap = Number.isFinite(staggerSeconds) ? staggerSeconds : DEFAULT_BEAD_STAGGER_SECONDS;
  const gap = Math.max(0, Math.min(requestedGap, (duration - .05) / (BEAD_ORDER.length - 1)));
  const travel = duration - gap * (BEAD_ORDER.length - 1);
  const elapsed = playback.progress.beadsEntry * duration;
  return Object.fromEntries(BEAD_ORDER.map((id, index) => {
    const phase = (elapsed - index * gap) / travel;
    const current = computeClipState(easing, phase, phase).current as {progress: number};
    return [id, current.progress];
  })) as Record<typeof BEAD_ORDER[number], number>;
}
