import {clipEnd, evaluateClip, unit} from '../micro-20/timeline';
import type {CloudSettings, ClipTiming} from './settings';
import type {CloudState} from '../micro-09/DitherClouds';

export const CLOUD_KEYS = ['slideIn', 'partialRecede', 'recede'] as const;

/** The authored from/to curve controls stage progress; extents remain the X/Y dials. */
function stage(clip: ClipTiming, time: number) {
  if (time < clip.at) return 0;
  if (time >= clipEnd(clip)) return 1;
  const from = clip.from?.progress ?? 0, to = clip.to?.progress ?? 1;
  return to === from ? 0 : unit((evaluateClip(clip, time) - from) / (to - from));
}

export function sampleClouds(time: number, clouds: CloudSettings, spread: number, flowCloudYOffset = 37): CloudState | null {
  const {slideIn, partialRecede, recede} = clouds.timing;
  const {x, y} = clouds.controls;
  if (x === 0 || time < slideIn.at) return null;
  const entering = time < partialRecede.at;
  const extent = entering ? x * stage(slideIn, time)
    : time < recede.at ? x + (y - x) * stage(partialRecede, time)
      : y * (1 - stage(recede, time));
  if (extent <= 0) return null;
  // The entry's terminal pose equals recession's initial pose even when X<1.
  // At X=1 the old inward/upward entry is preserved; smaller absolute extents
  // blend into a partial recession instead of canceling out against X.
  const recession = 1 - extent;
  if (entering) {
    const amount = stage(slideIn, time);
    const partial = (1 - x) * amount, remaining = 1 - amount;
    return {progress: partial, yOffset: 27 + 10 * partial,
      translateY: 720 * remaining + 900 * partial,
      translateX: [remaining ? -spread * remaining : 0, spread * remaining] as [number, number]};
  }
  // Carry imported Flow framing smoothly into the one frame-pinned layer.
  // The Flow control has its full effect by the end of partial recession.
  const flowOffset = (flowCloudYOffset - 37) * stage(partialRecede, time);
  return {progress: recession, yOffset: 27 + 10 * recession + flowOffset,
    translateY: 900 * recession, translateX: [0, 0]};
}
