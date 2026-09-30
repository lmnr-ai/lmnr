import type {ScoreStyle} from '../style';
import {composeBluenote} from './composition';
import {bluenoteDucks, designBluenote} from './design';

export const bluenote: ScoreStyle = {
  id: 'bluenote',
  title: 'Bluenote',
  ducks: bluenoteDucks,
  compose: composeBluenote,
  design: designBluenote,
  space: {
    hall: {rt60: 1.6, predelay: .02, damping: 5200, size: .9, lowCut: 260},
    room: {rt60: .55, predelay: .006, damping: 6500, size: .5, lowCut: 180},
    delay: {time: 60 / 152 * .64, feedback: .2, damping: 3200},
    returns: [1.1, 2, .6],
  },
  eq: {highpass: 32, lowShelf: [95, 1], highShelf: [9000, 1.5]},
};
