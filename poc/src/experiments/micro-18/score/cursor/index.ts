import type {ScoreCues} from '../cues';
import type {ScoreStyle} from '../style';
import type {Mix} from '../voices';
import {AIR, KNOCK, TICK, composeCursor} from './composition';
import {knock, mallet, paper} from './instruments';

/** The reference bed sits ~6.5 dB under its narrator and swells ~2 dB in the gaps: slow dips, never pumping. */
const ducksCursor = (mix: Mix, cues: ScoreCues) => {
  for (const phrase of cues.voice) mix.duck(phrase.at, .66, .35, phrase.duration, .8);
};

/** The agent window in the Issues postlude: paper slides, a knock when it shuts, paper-tap typing, mallet badges. */
const designCursor = (mix: Mix, cues: ScoreCues) => {
  const issues = cues.issues;
  if (!issues.postludeActive) return;
  paper(mix, issues.windowDown.at, issues.windowDown.duration + .05, AIR, {level: .26, from: 1100, to: 450, peak: .3, pan: [0, 0]});
  knock(mix, issues.windowShut, 40, .55, {...KNOCK, pan: 0}, {decay: .08, wood: .35, click: .4});
  if (mix.typingEnabled) issues.typingEvents.forEach((event, i) =>
    knock(mix, event.time, [79, 77, 80, 75][(event.voice ?? i) % 4], .2, {...TICK, pan: .15 * Math.sin(i * 1.7), delay: 0}, {decay: .015, wood: .5, click: .9, drop: .4}));
  mallet(mix, issues.issueBadge, 75, .36, {...KNOCK, pan: -.2}, .4);
  paper(mix, issues.messageSend, .35, AIR, {level: .22, from: 500, to: 1500, peak: .6, pan: [-.2, .4]});
  mallet(mix, issues.queryBadge, 72, .34, {...KNOCK, pan: .2}, .4);
  paper(mix, issues.windowUp.at, issues.windowUp.duration + .05, AIR, {level: .22, from: 450, to: 1100, peak: .6, pan: [0, 0]});
};

/** Like the reference, hits land softer under words: the dry foley bus dips 4 dB under each phrase (sends are left alone). */
const tuckFoley = (mix: Mix, cues: ScoreCues) => {
  const gain = new Float32Array(mix.length).fill(1), edge = .06;
  for (const phrase of cues.voice) {
    const start = Math.round((phrase.at - edge) * 48_000), stop = Math.round((phrase.at + phrase.duration + edge) * 48_000), ramp = edge * 48_000;
    for (let n = Math.max(0, start); n < Math.min(mix.length, stop); n++)
      gain[n] = Math.min(gain[n], 1 - .37 * Math.min(1, (n - start) / ramp, (stop - n) / ramp));
  }
  for (let n = 0; n < mix.length; n++) { mix.sfx.l[n] *= gain[n]; mix.sfx.r[n] *= gain[n]; }
};

export const cursorPaper: ScoreStyle = {
  id: 'cursor-paper',
  title: 'Cursor paper (tape organ, paper knocks, A♭)',
  ducks: ducksCursor,
  compose: composeCursor,
  design: (mix, cues) => { designCursor(mix, cues); tuckFoley(mix, cues); },
  // Dry and close like the reference: a small warm room, a short dark hall and a quiet dotted-eighth echo.
  space: {
    hall: {rt60: 2.2, predelay: .02, damping: 3800, size: 1.2, lowCut: 180},
    room: {rt60: .45, predelay: .004, damping: 5000, size: .5, lowCut: 120},
    delay: {time: .375, feedback: .22, damping: 2400},
    returns: [1.6, 1.2, .7],
  },
  // A dark top (the reference has under 0.4 % of its energy above 2 kHz) and a round low end.
  eq: {highpass: 28, lowShelf: [110, 1.5], highShelf: [5000, -4]},
};
