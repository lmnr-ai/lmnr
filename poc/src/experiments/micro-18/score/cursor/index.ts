import type {ScoreCues} from '../cues';
import {OnePole, db, integratedLufs, seeded, type Stereo} from '../dsp';
import type {ScoreStyle} from '../style';
import type {Mix} from '../voices';
import {AIR, KNOCK, TICK, composeCursor} from './composition';
import {AIR as AIR2, KNOCK as KNOCK2, TICK as TICK2, composeCursorV2} from './composition-v2';
import {composeCursorV3, designCursorV3} from './composition-v3';
import {composeCursorV4, wordEndOf} from './composition-v4';
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

/** Extra duck per phrase (dB), measured so every line clears the bed by ~6.5 LU despite the arc under it (n13 and n16 also hold the voice peaks). */
const EXTRA_DUCK_DB = [0, 0, 0, -1.3, 0, 0, 0, -.4, -3.9, 0, -2, -2.1, -2, 0, -1.4, -2, 0, -.4, -3.9, -.8, -2.6, 0, -4.5];

/** The story's loudness arc for the music bus (dB), interpolated linearly in dB, so ramps read as fades. */
const arcCursorV2 = (cues: ScoreCues): [number, number][] => {
  const cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion;
  const silence = cost.depletion.at + cost.depletion.duration - .2;
  return [
    [0, -4.5], [cues.chapter.cost.start - .5, -4], // Act 1 is small and close
    [cues.chapter.cost.start, -3], [cost.depletion.at, 0], [silence, 0], // Cost climbs to the depletion
    [silence + .3, -10], [flow.reveal - .08, -10], // "Until now" is near silence
    [flow.reveal, 1], [flow.cameraToAnalysis.at, 0], [cues.chapter.issues.start, -.5], // Flow-1 opens up
    [issues.prelude.explanation?.at ?? issues.prelude.zoomOut.at - 2.5, -.5], [issues.native, 1.5], [issues.native + 1, .5], // a long swell into the clusters
    [end.start, 0], [end.logo, 3], [end.logo + .8, 2.5], [cues.duration - .1, -45], // IV → V crescendo, a bloom, then a full decay
  ];
};

const ducksArc = (mix: Mix, cues: ScoreCues, extra: readonly number[], arcOf = arcCursorV2, attacks: Partial<Record<number, number>> = {}) => {
  cues.voice.forEach((phrase, i) => mix.duck(phrase.at, .66 * db(extra[i] ?? 0), attacks[i] ?? .35, phrase.duration, .8));
  const arc = arcOf(cues);
  for (let n = 0, k = 0; n < mix.length; n++) {
    const t = n / 48_000;
    while (k + 1 < arc.length && arc[k + 1][0] <= t) k++;
    const [t0, d0] = arc[k], [t1, d1] = arc[k + 1] ?? arc[k];
    mix.musicGain[n] *= db(t1 > t0 ? d0 + (d1 - d0) * Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : d0);
  }
};

const designCursorV2 = (mix: Mix, cues: ScoreCues) => {
  const issues = cues.issues;
  if (!issues.postludeActive) return;
  paper(mix, issues.windowDown.at, issues.windowDown.duration + .05, AIR2, {level: .22, from: 1100, to: 450, peak: .3, pan: [0, 0]});
  knock(mix, issues.windowShut, 40, .5, {...KNOCK2, pan: 0}, {decay: .08, wood: .35, click: .4});
  if (mix.typingEnabled) issues.typingEvents.forEach((event, i) =>
    knock(mix, event.time, [79, 77, 80, 75][(event.voice ?? i) % 4], .16, {...TICK2, pan: .15 * Math.sin(i * 1.7), delay: 0},
      {decay: .015 * (.8 + .4 * mix.random()), wood: .5, click: .9, drop: .4, clickHz: 1150 + 400 * mix.random()}));
  mallet(mix, issues.issueBadge, 75, .34, {...KNOCK2, pan: -.2}, .4);
  paper(mix, issues.windowUp.at, issues.windowUp.duration + .05, AIR2, {level: .2, from: 450, to: 1100, peak: .6, pan: [0, 0]});
};

/**
 * Glue, as a mix engineer's master chain would: gentle asymmetric tape saturation, a slow 2:1 bus
 * compressor (~2 dB), a mono low end below 120 Hz and a faint tape-hiss floor, so bed and foley share one space.
 */
const glueCursorV2 = (master: Stereo) => {
  const scale = db(-16 - integratedLufs(master)), drive = 1.4, bias = .08, offset = Math.tanh(drive * bias);
  const sat = (x: number) => (Math.tanh(drive * (x * scale + bias)) - offset) / drive / scale;
  const random = seeded(0x7a9e), hiss = [OnePole.lowpass(6000), OnePole.lowpass(6000)], side = [OnePole.lowpass(120), OnePole.lowpass(120)];
  const attack = 1 - Math.exp(-1 / (.03 * 48_000)), release = 1 - Math.exp(-1 / (.3 * 48_000));
  // Threshold sits above the -16 LUFS working level, so only peaks are held and the arc survives.
  const threshold = db(-17) / scale, floor = db(-50) / scale;
  let power = 0;
  for (let n = 0; n < master.length; n++) {
    let l = sat(master.l[n]), r = sat(master.r[n]);
    const mid = (l + r) / 2, s = (l - r) / 2, low = side[1].process(side[0].process(s));
    l = mid + s - low; r = mid - s + low;
    const square = (l * l + r * r) / 2;
    power += (square > power ? attack : release) * (square - power);
    const rms = Math.sqrt(power), gain = rms > threshold ? (threshold / rms) ** .5 : 1;
    master.l[n] = l * gain + hiss[0].process(random() * 2 - 1) * floor;
    master.r[n] = r * gain + hiss[1].process(random() * 2 - 1) * floor;
  }
};

export const cursorPaperV2: ScoreStyle = {
  id: 'cursor-paper-v2',
  title: 'Cursor paper v2 (one continuous bed, story arc, fewer hits, master glue)',
  ducks: (mix, cues) => ducksArc(mix, cues, EXTRA_DUCK_DB),
  compose: composeCursorV2,
  design: (mix, cues) => { designCursorV2(mix, cues); tuckFoley(mix, cues); },
  space: {...cursorPaper.space, returns: [2.2, 1.2, .7]},
  eq: cursorPaper.eq,
  master: glueCursorV2,
};

/** Extra duck per phrase (dB) for v3, whose keys add energy at 300–500 Hz under the voice. */
const EXTRA_DUCK_DB_V3 = EXTRA_DUCK_DB.map((value, i) => value - ({10: .6, 11: .6, 20: 1, 22: 1.2}[i] ?? 0));

export const cursorPaperV3: ScoreStyle = {
  id: 'cursor-paper-v3',
  title: 'Cursor paper v3 (repeating swelled keys, sine pops and thumps, soft breaths)',
  ducks: (mix, cues) => ducksArc(mix, cues, EXTRA_DUCK_DB_V3),
  compose: composeCursorV3,
  design: (mix, cues) => { designCursorV3(mix, cues); tuckFoley(mix, cues); },
  space: cursorPaperV2.space,
  eq: cursorPaper.eq,
  master: glueCursorV2,
};

/** The October 2 take speaks n21–n23 1.4–2.2 dB softer, so v3 on the editable-v12 cut ducks those lines deeper. */
const EXTRA_DUCK_DB_V3_OCT2 = EXTRA_DUCK_DB_V3.map((value, i) => value - ({20: 3.4, 21: .6, 22: 1.6}[i] ?? 0));

export const cursorPaperV3Oct2: ScoreStyle = {...cursorPaperV3, id: 'cursor-paper-v3-oct2',
  title: 'Cursor paper v3 on the October 2 take', ducks: (mix, cues) => ducksArc(mix, cues, EXTRA_DUCK_DB_V3_OCT2)};

/**
 * v4's arc builds like the reference: a quiet plateau through Act 1 and Cost, a step up at the reveal, a capped Issues
 * that dips before the conclusion, and the peak on the logo after the last word, ringing out at about -4 dB/s.
 */
const arcCursorV4 = (cues: ScoreCues): [number, number][] => {
  const cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion, reveal = flow.reveal;
  const silence = cost.depletion.at + cost.depletion.duration - .2, wordEnd = wordEndOf(cues);
  const n21 = cues.voice[20], beforeEnd = n21 ? n21.at + n21.duration : end.start - 1.6, half = end.start + (end.logo - end.start) * .5;
  const arc: [number, number][] = [
    [0, -6], [cues.chapter.cost.start - .5, -5.5], [cues.chapter.cost.start, -5], [cost.depletion.at, -2.5], [silence, -2.5],
    [silence + .3, -11], [reveal - 1.2, -11], [reveal - .08, -7], [reveal, 2.5], [reveal + .9, 1],
    [flow.cameraToAnalysis.at, 0], [flow.coverShut, .5], [cues.chapter.issues.start, -1.5],
    [issues.prelude.explanation?.at ?? issues.prelude.zoomOut.at - 2.5, -1.5], [issues.native, .5], [issues.native + 1, -.5],
    [beforeEnd, -3], [end.start - .1, -5], [end.start, -1], [half, .5], [end.logo - .3, 1.5],
    [wordEnd, 1.5], [wordEnd + .73, 3], [wordEnd + 1.53, 2], [cues.duration - .1, -17],
  ];
  arc.forEach(([t], i) => { if (i && t < arc[i - 1][0]) throw new Error(`arcCursorV4 key ${i} at ${t} runs backwards`); });
  return arc;
};

/** v4 ducks n11 later and shallower so the reveal's bloom lands; n21 and n23 go deeper under the conclusion's new layers. */
const EXTRA_DUCK_DB_V4 = EXTRA_DUCK_DB_V3_OCT2.map((value, i) => ({10: -1.8, 20: value - .5, 22: -8.5}[i] ?? value));

export const cursorPaperV4: ScoreStyle = {
  id: 'cursor-paper-v4',
  title: 'Cursor paper v4 (builds to the logo: V → I reveal, brightening IV–V–I, a ringing tonic)',
  ducks: (mix, cues) => ducksArc(mix, cues, EXTRA_DUCK_DB_V4, arcCursorV4, {10: .15}),
  compose: composeCursorV4,
  design: (mix, cues) => { designCursorV3(mix, cues); tuckFoley(mix, cues); },
  space: cursorPaperV2.space,
  eq: cursorPaper.eq,
  master: glueCursorV2,
};
