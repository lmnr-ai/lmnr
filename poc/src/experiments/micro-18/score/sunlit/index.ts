import {steadyDucks} from '../lofi';
import {designAcoustic, type Player} from '../nocturne/design';
import type {ScoreStyle} from '../style';
import {bell} from '../voices';
import {composeSunlit} from './composition';

/** The foley's telemetry as soft sine-glass, the lead's upper octave. */
const glass: Player = (mix, time, midi, velocity, route, length) => bell(mix, time, midi, velocity * .8, route, {decay: Math.max(.3, length * 5), ratio: 1, index: .5});

export const sunlitSynth: ScoreStyle = {
  id: 'sunlit-synth',
  title: 'Sunlit synth',
  ducks: steadyDucks,
  compose: composeSunlit,
  // Nocturne's foley in F on sine-glass.
  design: designAcoustic(2, glass, () => true),
  space: {
    hall: {rt60: 2.4, predelay: .03, damping: 6500, size: 1.2, lowCut: 280},
    room: {rt60: .3, predelay: .004, damping: 7000, size: .4, lowCut: 250},
    delay: {time: .375, feedback: .38, damping: 4200},
    returns: [1.8, 1.2, 1.3],
  },
  eq: {highpass: 30, lowShelf: [80, .5], highShelf: [9000, 2]},
};
