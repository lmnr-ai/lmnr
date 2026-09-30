import type {ScoreCues} from '../cues';
import type {ScoreStyle} from '../style';
import type {Mix, Route} from '../voices';
import {composeDigital} from './composition';
import {blip, click, zap} from './instruments';

const UI: Route = {bus: 'sfx', gain: .9, room: .06};

/** The agent window's foley in the same language: keys are data blips, the window switches with clicks and zaps. */
function designDigital(mix: Mix, cues: ScoreCues) {
  const issues = cues.issues;
  zap(mix, issues.windowDown.at, 86, 74, issues.windowDown.duration * .6, .3, UI);
  click(mix, issues.windowShut, .5, UI);
  // Typing is a stream of blips on D Lydian, one pitch per key identity, never the mechanical keyboard.
  if (mix.typingEnabled) issues.typingEvents.forEach(event => blip(mix, event.time, [81, 85, 83, 88, 86][(event.voice ?? 0) % 5], .32, {...UI, pan: .15 * Math.sin(event.voice ?? 0)}, .022));
  blip(mix, issues.issueBadge, 80, .45, UI, .06);
  zap(mix, issues.messageSend, 74, 93, .18, .3, UI);
  blip(mix, issues.queryBadge, 80, .45, UI, .06);
  zap(mix, issues.windowUp.at, 74, 86, issues.windowUp.duration * .6, .28, UI);
}

/** LAM-2315: the digital reference's sub-first, gated, Lydian trap language over the Ultimate 3 picture. */
export const digitalLydian: ScoreStyle = {
  id: 'digital-lydian',
  title: 'Digital (808, gated Lydian blocks)',
  // No music ducks: the reference switches blocks off instead, and the voice sidechains the bed in the final mix.
  ducks: () => {},
  compose: composeDigital,
  design: designDigital,
  // Near mono and dry, like the reference: a short room, a quick 16th-note echo on the blips, almost no hall.
  space: {
    hall: {rt60: 1.4, predelay: .01, damping: 6000, size: .8, lowCut: 400},
    room: {rt60: .3, predelay: .003, damping: 9000, size: .35, lowCut: 300},
    delay: {time: .3, feedback: .28, damping: 6000},
    returns: [.4, 1.2, 1],
  },
  eq: {highpass: 24, lowShelf: [70, 0], highShelf: [9000, 1.5]},
};
