import {arabesque, arabesqueAcoustic, arabesqueAcousticChill} from './arabesque';
import {aria, ariaAcoustic} from './aria';
import {ultimate3ScoreCues} from './cues';
import {KEYBOARDS} from './keyboards';
import {cityPop} from './city-pop';
import {cursorPaper, cursorPaperV2, cursorPaperV3, cursorPaperV3Oct2} from './cursor';
import {glide, glideArc, glideMinimal, glideMinimalLift, glideMinimalLinger} from './glide';
import {lofiRhodes} from './lofi';
import {minimalTechno} from './techno';
import {nocturne, nocturneAcoustic, nocturneDigital, nocturneDuet} from './nocturne';
import {phase} from './phase';
import {highlife} from './highlife';
import {signal} from './signal';
import {stompGlock} from './stomp';
import {sunlitSynth} from './sunlit';
import type {ScoreStyle} from './style';
import {tactileGlass} from './tactile-glass';
import {tintinnabuli} from './tintinnabuli';
import {Stereo, db, integratedLufs, limit, masterEq, pingPong, reverb, samples, seeded, toDb, truePeak} from './dsp';
import {Mix, type PianoBank, type StringBanks} from './voices';
import {normalizeEffectTuning, type EffectTuning} from './tuning';
import type {Ultimate3Settings} from '../settings';

export const SCORE_STYLES: Record<string, ScoreStyle> = Object.fromEntries([tactileGlass, nocturne, signal, aria, arabesque, nocturneAcoustic, ariaAcoustic, arabesqueAcoustic, arabesqueAcousticChill, nocturneDuet, nocturneDigital, phase, tintinnabuli, lofiRhodes, cityPop, minimalTechno, sunlitSynth, highlife, stompGlock, glide, glideMinimal, glideMinimalLift, glideMinimalLinger, glideArc, cursorPaper, cursorPaperV2, cursorPaperV3, cursorPaperV3Oct2].map(style => [style.id, style]));

export type ScoreRenderOptions = {style?: string; keyboard?: string; strings?: StringBanks; seed?: number; targetLufs?: number; ceilingDb?: number; stems?: boolean; tuning?: EffectTuning; typing?: boolean};
export type ScoreReport = {
  style: string; duration: number; lufs: number; truePeakDb: number; limiterDb: number;
  stems: Record<string, {lufs: number; peakDb: number}>; counts: Record<string, number>;
};

const sum = (length: number, parts: [Stereo, number][]) => {
  const out = new Stereo(length);
  for (const [part, gain] of parts) for (let n = 0; n < length; n++) { out.l[n] += part.l[n] * gain; out.r[n] += part.r[n] * gain; }
  return out;
};
const peakDb = (buffer: Stereo) => { let peak = 0; for (let n = 0; n < buffer.length; n++) peak = Math.max(peak, Math.abs(buffer.l[n]), Math.abs(buffer.r[n])); return toDb(peak); };

/** Render the full Ultimate 3 score: a deterministic function of settings, piano samples and seed. */
export function renderUltimate3Score(settings: Ultimate3Settings, piano: PianoBank, options: ScoreRenderOptions = {}) {
  const cues = ultimate3ScoreCues(settings);
  const length = samples(cues.duration);
  const style = SCORE_STYLES[options.style ?? tactileGlass.id];
  if (!style) throw new Error(`Unknown score style "${options.style}". Available: ${Object.keys(SCORE_STYLES).join(', ')}`);
  const tuning = normalizeEffectTuning(options.tuning);
  const mix = new Mix(length, seeded(options.seed ?? 0x1a31a), style.keys?.() ?? piano, options.strings, tuning);
  // The lubed linear "thock" was picked over the original click; see keyboards.ts for the others.
  mix.keyboard = KEYBOARDS[options.keyboard ?? 'thock'];
  if (!mix.keyboard) throw new Error(`Unknown keyboard "${options.keyboard}". Available: ${Object.keys(KEYBOARDS).join(', ')}`);

  mix.typingEnabled = options.typing !== false;
  style.ducks(mix, cues);
  style.compose(mix, cues);
  style.design(mix, cues);

  const space = style.space ?? {};
  const hall = reverb(mix.hall, space.hall ?? {rt60: 3.1, predelay: .025, damping: 5200, size: 1.35, lowCut: 220});
  const room = reverb(mix.room, space.room ?? {rt60: .65, predelay: .006, damping: 7000, size: .55, lowCut: 250});
  const delay = space.delay ?? {time: .375, feedback: .38, damping: 3800};
  const echo = pingPong(mix.delay, delay.time, delay.feedback, delay.damping);
  const [hallReturn, roomReturn, echoReturn] = space.returns ?? [2.4, 2, 1.4];
  const master = sum(length, [[mix.music, tuning.mix.music], [mix.sfx, tuning.mix.sfx], [hall, hallReturn * tuning.mix.hall], [room, roomReturn * tuning.mix.room], [echo, echoReturn * tuning.mix.delay]]);
  style.master?.(master, cues);
  masterEq(master, style.eq ?? {highpass: 26, lowShelf: [70, -2.5], highShelf: [7000, 3.5]});

  // Normalise, brickwall, then correct once for what the limiter shaved off.
  const target = options.targetLufs ?? -14, ceiling = db(options.ceilingDb ?? -1.2);
  let limiterDb = 0;
  for (let pass = 0; pass < 2; pass++) {
    const gain = db(target - integratedLufs(master));
    for (let n = 0; n < length; n++) { master.l[n] *= gain; master.r[n] *= gain; }
    limiterDb = Math.min(limiterDb, limit(master, ceiling));
  }
  const fade = samples(.35);
  for (let n = length - fade; n < length; n++) { const g = (length - n) / fade; master.l[n] *= g; master.r[n] *= g; }

  const report: ScoreReport = {
    style: style.id, duration: cues.duration, lufs: integratedLufs(master), truePeakDb: toDb(truePeak(master)), limiterDb,
    stems: {}, counts: mix.counts,
  };
  const stems = {music: mix.music, sfx: mix.sfx, hall, room, delay: echo};
  for (const [name, stem] of Object.entries(stems)) report.stems[name] = {lufs: integratedLufs(stem), peakDb: peakDb(stem)};
  return {master, report, stems: options.stems ? stems : undefined, cues};
}
