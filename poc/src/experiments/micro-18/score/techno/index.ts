import {steadyDucks} from '../lofi';
import {designAcoustic, type Player} from '../nocturne/design';
import {gridOf, type ScoreStyle} from '../style';
import {bell} from '../voices';
import {composeTechno} from './composition';

/** The foley's telemetry pings as glass bells, rung longer for longer notes. */
const glass: Player = (mix, time, midi, velocity, route, length) => bell(mix, time, midi, velocity * .8, route, {decay: Math.max(.25, length * 6), ratio: 3.5, index: 1.1});

export const minimalTechno: ScoreStyle = {
  id: 'minimal-techno',
  title: 'Minimal techno, glassy',
  ducks: steadyDucks,
  compose: composeTechno,
  // Nocturne's foley in A on glass bells, snapped onto the score's 16th grid.
  design: designAcoustic(6, glass, () => true, cues => {
    const origin = gridOf(cues, 0);
    return {quantize: time => origin + Math.round((time - origin) / .125) * .125};
  }),
  space: {
    hall: {rt60: 2.6, predelay: .03, damping: 7000, size: 1.3, lowCut: 300},
    room: {rt60: .35, predelay: .004, damping: 8000, size: .4, lowCut: 300},
    delay: {time: .375, feedback: .36, damping: 5000},
    returns: [1.8, 1.4, 1.2],
  },
  eq: {highpass: 28, lowShelf: [70, 1], highShelf: [8000, 1.5]},
};
