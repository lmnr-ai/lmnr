// Build a LAM-2317 Cursor-direction bed under the approved editable-v12 phrases; never replaces a bed.
//   pnpm exec tsx scripts/build-ultimate3-cursor-bed.ts [--style cursor-paper-v3] [--bed-db -9.2] [--ceiling-db -1.25] [--true-peak]
//     [--settings handoff/voiceover-2026-10-02/default-settings.json] [--seed 107290] [--out public/audio/voiceover/editable-v12-cursor-v3] [--stems <dir>]
// The style ducks against the placed narration (cues.voice), so the settings must carry the phrase slots. Bed + voice is
// a plain sum in preview and export, so the only limiter on the mix is the bed-only safety dip below.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Stereo, db, integratedLufs, toDb, truePeak} from '../src/experiments/micro-18/score/dsp';
import {renderUltimate3Score} from '../src/experiments/micro-18/score/render';
import {normalizeSettings} from '../src/experiments/micro-18/settings';
import {ultimate3DurationFrames} from '../src/experiments/micro-18/sample';
import {VOICEOVER_PHRASES, VOICEOVER_SOURCE_ROOT} from '../src/experiments/micro-18/voiceover-phrases';
import {mixVoiceoverPcm, type StereoPcm} from '../src/experiments/micro-18/voiceover-schedule';
import {decodePcm24, encodeFloat32, encodePcm24} from './voiceover-pcm';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');

const style = option('style') ?? 'cursor-paper-v3', seed = Number(option('seed') ?? 107290);
// The voice clears the bed by a ~7 LU median, as in the Cursor reference.
const bedDb = Number(option('bed-db') ?? -9.2);
/** Ceiling for bed + voice; the voice alone peaks at -1.54 dBFS. Sample peaks at -1.25 land at about -1 dBTP for v3. */
const CEILING_DB = Number(option('ceiling-db') ?? -1.25);
// Brighter beds (v4) overshoot between samples: --true-peak holds the ceiling at 4× interpolated points too.
const TRUE_PEAK = args.includes('--true-peak');
const settingsPath = resolve(root, option('settings') ?? 'handoff/voiceover-2026-10-02/default-settings.json');
const dest = resolve(root, option('out') ?? `public/audio/voiceover/editable-v12-${style.replace('cursor-paper', 'cursor')}`);
for (const file of ['bed.wav', 'manifest.json']) if (existsSync(join(dest, file))) throw new Error(`Refusing to overwrite ${join(dest, file)}`);

const settingsBytes = readFileSync(settingsPath);
const settings = normalizeSettings(JSON.parse(settingsBytes.toString()));
const phraseRoot = join(root, 'public', VOICEOVER_SOURCE_ROOT);
const phraseManifestBytes = readFileSync(join(phraseRoot, 'manifest.json'));
const phraseManifest = JSON.parse(phraseManifestBytes.toString());
const length = ultimate3DurationFrames(settings) * 1600;
if (phraseManifest.samples !== length) throw new Error('The phrases were placed on a different cut length');
const sources = Object.fromEntries(VOICEOVER_PHRASES.map(phrase => {
  const record = phraseManifest.phrases.find((entry: {id: string}) => entry.id === phrase.id);
  const bytes = readFileSync(join(phraseRoot, record.file));
  if (hash(bytes) !== record.sha256) throw new Error(`Phrase hash mismatch: ${phrase.id}`);
  return [phrase.id, decodePcm24(bytes)];
}));

// The score owns every sound but the voice, typing included, so the preview plays exactly one music/FX bed.
const {master: score, report, stems} = renderUltimate3Score(settings, [], {style, seed, stems: option('stems') !== undefined});
const bed = new Stereo(length), gain = db(bedDb);
for (let n = 0; n < Math.min(length, score.length); n++) { bed.l[n] = score.l[n] * gain; bed.r[n] = score.r[n] * gain; }

// Voice-aware safety: dip the bed (never the voice) wherever the sum would pass the ceiling.
const voice = mixVoiceoverPcm({l: new Float32Array(length), r: new Float32Array(length)}, sources, settings);
const ceiling = db(CEILING_DB), need = new Float32Array(length).fill(1);
for (let n = 0; n < length; n++) for (const [v, b] of [[voice.l[n], bed.l[n]], [voice.r[n], bed.r[n]]])
  if (Math.abs(v + b) > ceiling) need[n] = Math.min(need[n], Math.max(0, (ceiling - Math.abs(v)) / Math.abs(b)));
if (TRUE_PEAK) {
  // Hann-windowed sinc at 1/4, 2/4, 3/4 between samples; voice and bed are interpolated apart so the bed-only gain stays solvable.
  const taps = 8, phases = [.25, .5, .75].map(fraction => Array.from({length: 2 * taps}, (_, k) => {
    const x = k - taps + 1 - fraction;
    return Math.sin(Math.PI * x) / (Math.PI * x) * (.5 + .5 * Math.cos(Math.PI * x / taps));
  }));
  for (const [v, b] of [[voice.l, bed.l], [voice.r, bed.r]]) for (let n = taps; n < length - taps; n++) {
    if (Math.abs(v[n]) + Math.abs(b[n]) < ceiling * .6) continue;
    for (const kernel of phases) {
      let vi = 0, bi = 0;
      for (let k = 0; k < kernel.length; k++) { vi += v[n - taps + 1 + k] * kernel[k]; bi += b[n - taps + 1 + k] * kernel[k]; }
      if (Math.abs(vi + bi) <= ceiling) continue;
      const g = Math.max(0, (ceiling - Math.abs(vi)) / Math.abs(bi));
      need[n] = Math.min(need[n], g); need[n + 1] = Math.min(need[n + 1], g);
    }
  }
}
const safety = new Float32Array(length);
const attack = 1 - Math.exp(-1 / (.002 * 48_000)), recover = 1 - Math.exp(-1 / (.08 * 48_000));
for (let n = length - 1, g = 1; n >= 0; n--) { g = Math.min(need[n], g + (1 - g) * attack); safety[n] = g; }
let safetyDb = 0, dipped = 0;
for (let n = 0, g = 1; n < length; n++) {
  g = Math.min(safety[n], g + (1 - g) * recover);
  bed.l[n] *= g; bed.r[n] *= g; safetyDb = Math.min(safetyDb, toDb(g)); if (g < db(-1)) dipped++;
}

const bedBytes = encodePcm24(bed), decoded = decodePcm24(bedBytes);
const stereo = (pcm: StereoPcm) => { const out = new Stereo(length); out.l.set(pcm.l.subarray(0, length)); out.r.set(pcm.r.subarray(0, length)); return out; };
const mixed = stereo(mixVoiceoverPcm(decoded, sources, settings));
mkdirSync(dest, {recursive: true});
writeFileSync(join(dest, 'bed.wav'), bedBytes, {flag: 'wx'});
const manifest = {
  version: 1, scoreStyle: style, seed, sampleRate: 48000, frames: length / 1600, samples: length,
  bed: {file: 'bed.wav', sha256: hash(bedBytes)}, bedDb, truePeakSafety: TRUE_PEAK,
  settingsSha256: hash(settingsBytes), phraseRoot: VOICEOVER_SOURCE_ROOT, phraseManifestSha256: hash(phraseManifestBytes),
  levels: {scoreLufs: report.lufs, bedLufs: integratedLufs(stereo(decoded)), voiceLufs: integratedLufs(stereo(voice)), ceilingDb: CEILING_DB,
    bedSafetyDb: safetyDb, bedSafetySecondsOver1Db: dipped / 48_000, mixLufs: integratedLufs(mixed), mixTruePeakDb: toDb(truePeak(mixed))},
  note: `Voice-free bed (score, foley and typing) at ${bedDb} dB, ducked against the placed ${VOICEOVER_SOURCE_ROOT} phrases at these settings; rebuild it for a new cut.`,
};
writeFileSync(join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'});
const stemDir = option('stems');
if (stems && stemDir) {
  mkdirSync(resolve(stemDir), {recursive: true});
  for (const [name, stem] of Object.entries(stems)) writeFileSync(resolve(stemDir, `${name}.wav`), encodeFloat32(stem));
}
console.log(JSON.stringify({dest, ...manifest.levels, counts: report.counts}, null, 2));
