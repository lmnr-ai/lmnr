import {randomForCell} from '../micro-14/appearance';
import type {ClipTiming} from '../micro-14/timeline';
import {APPEARANCE_SEED} from './starting-positions';

// Independent salt avoids reusing the appearance order. The window selects
// START times only: flights may continue after its right edge.
export const travelTimingForCell = (initialCell: number, startWindow: ClipTiming, duration: number): ClipTiming => ({
  at: startWindow.at + randomForCell(APPEARANCE_SEED ^ 0x51ed270b, initialCell) * startWindow.duration,
  duration,
});
