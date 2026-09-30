import type {ScoreCues} from '../cues';
import type {ScoreStyle} from '../style';
import type {Mix, Route} from '../voices';
import {composeDigital} from './composition';
import {blip, click, droplet, hat, sweep, zap} from './instruments';

const UI: Route = {bus: 'sfx', gain: .9, room: .14};

/** The agent window's foley in the same language: keys are data taps, the window switches with flicks and latches. */
function designDigital(mix: Mix, cues: ScoreCues) {
  const issues = cues.issues;
  sweep(mix, issues.windowDown.at, issues.windowDown.duration, .3, UI, {peak: .4, split: true});
  zap(mix, issues.windowDown.at, 86, 74, issues.windowDown.duration * .6, .3, UI);
  zap(mix, issues.windowShut, 54, 42, .015, .55, UI);
  click(mix, issues.windowShut, .35, UI);
  // Typing is a stream of taps on D Lydian, one pitch per key identity, kept above D6 and out of the voice's band.
  if (mix.typingEnabled) issues.typingEvents.forEach(event => blip(mix, event.time, [86, 90, 88, 93, 92][(event.voice ?? 0) % 5], .24, {...UI, pan: .15 * Math.sin(event.voice ?? 0)}, .02));
  // The badges are the blue agent's droplet; the send rises on a zap over a 32nd hat roll.
  droplet(mix, issues.issueBadge, 93, .4, UI, {fifth: true});
  zap(mix, issues.messageSend, 74, 93, .18, .3, UI);
  for (let i = 0; i < 4; i++) hat(mix, issues.messageSend + i * .05, .25 + i * .06, {...UI, pan: .2});
  droplet(mix, issues.queryBadge, 93, .4, UI, {fifth: true});
  sweep(mix, issues.windowUp.at, issues.windowUp.duration, .35, UI, {peak: .5, split: true});
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
  // Near mono but never in a vacuum: a small, bright room (decorrelated, so it widens without panning), a 16th-note echo on the blips, almost no hall.
  space: {
    hall: {rt60: 1.4, predelay: .01, damping: 6000, size: .8, lowCut: 400},
    room: {rt60: .35, predelay: .006, damping: 11_000, size: .3, lowCut: 350},
    delay: {time: .3, feedback: .28, damping: 6000},
    returns: [.4, 6, 2.2],
    // Width is one of the things the first half withholds, so its room is mono until the drop.
    monoUntil: cues => cues.flow.reveal,
  },
  // The 808 hats and the taps' clicks carry the top octave now; a gentle lift keeps it open.
  eq: {highpass: 24, lowShelf: [90, -5.5], highShelf: [4500, 4]},
};
