import type {ScoreCues} from './cues';
import type {ReverbOptions} from './dsp';
import type {Mix} from './voices';

/** One complete soundtrack. `ducks` runs first, then `compose` (music bus), then `design` (foley bus). */
export type ScoreStyle = {
  id: string;
  title: string;
  /** Needs the VSCO-2 string banks; the render script only decodes them for these styles. */
  strings?: boolean;
  ducks(mix: Mix, cues: ScoreCues): void;
  compose(mix: Mix, cues: ScoreCues): void;
  design(mix: Mix, cues: ScoreCues): void;
  space?: {
    hall?: ReverbOptions; room?: ReverbOptions;
    delay?: {time: number; feedback: number; damping: number};
    /** Return levels for [hall, room, delay] into the master. */
    returns?: [number, number, number];
  };
  eq?: {highpass: number; lowShelf: [number, number]; highShelf: [number, number]};
};

/** One grid for the whole film: beat 0 sits 18 ms in, so Cost (14.518s) is beat 29 and the logo is beat 104. */
export const gridOf = (cues: ScoreCues, beat: number) => cues.chapter.cost.start + (beat - 29) * .5;
/** Nearest grid beat (in `division`ths) to an absolute time. */
export const beatOf = (cues: ScoreCues, time: number, division = 1) => Math.round(((time - cues.chapter.cost.start) / .5 + 29) * division) / division;
