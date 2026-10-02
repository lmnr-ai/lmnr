import type {ClipTiming} from './timeline';

// Stateless cell-keyed hash: adding samples, scrubbing, or resizing the segment
// cannot consume randomness or reshuffle the appearance order.
export const randomForCell = (seed: number, cell: number) => {
  let value = (seed | 0) ^ Math.imul(cell + 1, 0x9e3779b1);
  value = Math.imul(value ^ value >>> 16, 0x85ebca6b);
  value = Math.imul(value ^ value >>> 13, 0xc2b2ae35);
  return ((value ^ value >>> 16) >>> 0) / 4294967296;
};

export const warningAppearanceTiming = (seed: number, initialCell: number, segment: ClipTiming, transitionDuration: number): ClipTiming => {
  const duration = Math.min(segment.duration, Math.max(0, transitionDuration));
  return {at: segment.at + randomForCell(seed, initialCell) * (segment.duration - duration), duration};
};
