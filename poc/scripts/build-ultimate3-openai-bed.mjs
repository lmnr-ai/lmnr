// Prepare the LAM-2320 OpenAI-direction bed under the unchanged editable-v11 phrases; never replace a published bed.
// Usage: node scripts/build-ultimate3-openai-bed.mjs [edition bedDb stemsDir style] (default editable-v11-openai -7.5 <tmp> openai-pulse).
// v2: node scripts/build-ultimate3-openai-bed.mjs editable-v11-openai-tactile <bedDb> <stemsDir> openai-tactile
// Writes public/audio/voiceover/<edition>/{bed.wav,manifest.json} plus one solo stem per layer (not committed) that sum to the bed.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [edition = 'editable-v11-openai', trim = '-7.5', stemsArg, style = 'openai-pulse'] = process.argv.slice(2);
const seed = 107290, phrases = 'editable-v11', settings = 'handoff/openai-sound-design/preview-settings.json';
// Each style's `ScoreStyle.layers` and what its bed holds.
const STYLES = {
  'openai-pulse': {layers: ['sub', 'keys', 'glass', 'ticks', 'air', 'lift', 'typing'], holds: 'gated sub, keys, glass, ticks, air, lift and typing'},
  'openai-tactile': {layers: ['sub', 'body', 'keys', 'glass', 'grain', 'bloom', 'lift', 'typing'], holds: 'struck sub, body, plucks, glass, grains, blooms, lift and typing'},
};
if (!STYLES[style]) throw new Error(`Unknown style ${style}; expected ${Object.keys(STYLES).join(' or ')}`);
const {layers, holds} = STYLES[style];
// Trim so the narration clears the bed by a ~7 LU median and >= 4.5 LU on every line (the Arabesque bed: 4.7 median, 0.3 min).
const bedDb = Number(trim);
if (!Number.isFinite(bedDb)) throw new Error('bedDb must be a number');
const dest = join(root, 'public/audio/voiceover', edition);
if (existsSync(dest)) throw new Error(`Refusing to overwrite existing bed: ${dest}`);
const frames = Math.ceil(Object.values(JSON.parse(readFileSync(join(root, settings))).allocations).reduce((a, b) => a + b) * 30), samples = frames * 1600;
const phraseManifest = join(root, 'public/audio/voiceover', phrases, 'manifest.json');
if (JSON.parse(readFileSync(phraseManifest)).samples !== samples) throw new Error(`${phrases} phrases were placed on a different cut length`);
const work = mkdtempSync(join(tmpdir(), `ultimate3-${edition}-`)), stems = resolve(stemsArg ?? join(work, 'stems'));
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const render = (out, extra = []) => JSON.parse(execFileSync(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), 'scripts/render-ultimate3-score.ts',
  '--style', style, '--seed', String(seed), '--settings', settings, '--out', out, ...extra], {cwd: root, maxBuffer: 1 << 24}).toString());

// Normalise once to learn the -14 LUFS master gain, then render the bed and every layer at that fixed gain (no limiter),
// so the stems are exact parts of the bed. The score owns every sound but the voice, typing included: one bed, one owner.
// Peaks scale with the gain, so one probe finds the gain that leaves -1 dBTP of headroom in place of the limiter.
const normalised = render(join(work, 'normalised.wav')).gain, probe = render(join(work, 'probe.wav'), ['--gain', String(normalised)]);
const gain = normalised * Math.min(1, 10 ** ((-1 - probe.truePeakDb) / 20));
const score = join(work, 'score.wav'), report = render(score, ['--gain', String(gain)]);
if (report.truePeakDb > -.9) throw new Error(`Fixed-gain score clips: ${report.truePeakDb} dBTP`);
mkdirSync(stems, {recursive: true});
const stemReports = Object.fromEntries(layers.map(layer => [layer, render(join(stems, `${layer}.wav`),
  ['--gain', String(gain), '--layers', layers.map(other => `${other}=${other === layer ? 1 : 0}`).join(',')])]));

mkdirSync(dest, {recursive: true});
const bed = join(dest, 'bed.wav');
execFileSync('ffmpeg', ['-v', 'error', '-n', '-i', score, '-af', `volume=${bedDb}dB,apad=whole_len=${samples},atrim=end_sample=${samples},asetpts=PTS-STARTPTS`,
  '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', bed], {stdio: 'inherit'});
const round = value => Math.round(value * 100) / 100;
writeFileSync(join(dest, 'manifest.json'), JSON.stringify({version: 1, scoreStyle: style, seed, sampleRate: 48000, frames, samples,
  bed: {file: 'bed.wav', sha256: hash(bed)}, bedDb, masterGain: gain, normalisedGain: normalised, settingsSha256: hash(join(root, settings)),
  score: {lufs: round(report.lufs), truePeakDb: round(report.truePeakDb), counts: report.counts},
  layers: Object.fromEntries(Object.entries(stemReports).map(([layer, stem]) => [layer, {lufs: round(stem.lufs), truePeakDb: round(stem.truePeakDb)}])),
  phrases: `/audio/voiceover/${phrases}/`, phraseManifestSha256: hash(phraseManifest),
  note: `Voice-free bed (${holds}; no piano) at ${bedDb} dB; the narration stays the ${phrases} trims of the approved take. Layer stems render at the same fixed master gain and sum to the bed before the trim.`}, null, 2) + '\n', {flag: 'wx'});
console.log(`Prepared ${dest}; layer stems in ${stems}`);
