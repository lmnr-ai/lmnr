import {steadyDucks} from '../lofi';
import {designAcoustic, type Player} from '../nocturne/design';
import type {ScoreStyle} from '../style';
import {composeStomp} from './composition';
import {glock} from './instruments';

/** The foley's telemetry on the glockenspiel, rung longer for longer notes. */
const steel: Player = (mix, time, midi, velocity, route, length) => glock(mix, time, midi, velocity * .8, route, {decay: Math.max(.3, length * 4)});

export const stompGlock: ScoreStyle = {
  id: 'stomp-glock',
  title: 'Stomp & glock',
  strings: true,
  ducks: steadyDucks,
  compose: composeStomp,
  // Nocturne's foley in C on the glockenspiel.
  design: designAcoustic(-3, steel, () => true),
  space: {
    hall: {rt60: 2.2, predelay: .025, damping: 6000, size: 1.2, lowCut: 260},
    room: {rt60: .7, predelay: .008, damping: 5000, size: .7, lowCut: 120},
    delay: {time: .375, feedback: .24, damping: 4500},
    returns: [1.7, 1.7, .8],
  },
  eq: {highpass: 32, lowShelf: [80, .5], highShelf: [8500, 1]},
};
