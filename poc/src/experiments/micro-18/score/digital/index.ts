import type {ScoreCues} from '../cues';
import type {ScoreStyle} from '../style';
import type {Mix, Route} from '../voices';
import {composeDigital} from './composition';
import {click, droplet, glint, hat, sweep, thock, zap} from './instruments';

const UI: Route = {bus: 'sfx', gain: .9, room: .14};
const GLINT: Route = {bus: 'sfx', gain: .6, room: .2, delay: .15};

/** The agent window's foley in the same language: keys are soft thocks under the voice, the window moves on sweeps with a glint and shuts on a latch. */
function designDigital(mix: Mix, cues: ScoreCues) {
  const issues = cues.issues;
  // The narration runs over the whole window, so its moves have no pitched flicks (1–3 kHz): a sweep and a glint.
  sweep(mix, issues.windowDown.at, issues.windowDown.duration, .3, UI, {peak: .4, split: true});
  glint(mix, issues.windowDown.at, 114, .4, {...GLINT, pan: -.3}, .05);
  zap(mix, issues.windowShut, 54, 42, .015, .55, UI);
  click(mix, issues.windowShut, .35, UI);
  // Typing is unpitched: a note per key would be a melody under the narration. Key identity varies level and pan.
  if (mix.typingEnabled) issues.typingEvents.forEach(event => thock(mix, event.time, .24 * (.9 + .2 * ((event.voice ?? 0) % 3) / 2), {...UI, pan: .3 * Math.sin(event.voice ?? 0)}));
  // The badges are the blue agent's droplet; the send is two rising glints over a 32nd hat roll.
  droplet(mix, issues.issueBadge, 119, .4, {...UI, pan: .3}, {fifth: true});
  [0, .06].forEach((offset, i) => glint(mix, issues.messageSend + offset, [114, 117][i], .4, {...GLINT, pan: .3}, .05));
  for (let i = 0; i < 4; i++) hat(mix, issues.messageSend + i * .05, .25 + i * .06, {...UI, pan: .2});
  droplet(mix, issues.queryBadge, 119, .4, {...UI, pan: -.3}, {fifth: true});
  sweep(mix, issues.windowUp.at, issues.windowUp.duration, .35, UI, {peak: .5, split: true});
  glint(mix, issues.windowUp.at, 117, .4, {...GLINT, pan: .3}, .05);
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
