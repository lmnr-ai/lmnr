import {steadyDucks} from '../lofi';
import {designAcoustic, type Player} from '../nocturne/design';
import type {ScoreStyle} from '../style';
import {composeHighlife} from './composition';
import {balafon} from './instruments';

/** The foley's telemetry on the balafon, rung longer for longer notes. */
const wood: Player = (mix, time, midi, velocity, route, length) => balafon(mix, time, midi, velocity * .85, route, {decay: Math.max(.2, length * 3)});

export const highlife: ScoreStyle = {
  id: 'highlife',
  title: 'Highlife sunshine',
  ducks: steadyDucks,
  compose: composeHighlife,
  // Nocturne's foley in G on the balafon.
  design: designAcoustic(4, wood, () => true),
  space: {
    hall: {rt60: 1.8, predelay: .02, damping: 6000, size: 1, lowCut: 280},
    room: {rt60: .4, predelay: .004, damping: 7000, size: .45, lowCut: 200},
    delay: {time: .375, feedback: .25, damping: 4000},
    returns: [1.6, 1.6, .9],
  },
  eq: {highpass: 32, lowShelf: [80, -.5], highShelf: [8500, 1.5]},
};
