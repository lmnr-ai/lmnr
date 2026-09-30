// Prepare the LAM-2317 Cursor-direction bed under the unchanged editable-v11 phrases; never replace a published bed.
// Usage: node scripts/build-ultimate3-cursor-bed.mjs [edition handoff] (default editable-v11-cursor cursor-sound-design).
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [edition = 'editable-v11-cursor', handoff = 'cursor-sound-design'] = process.argv.slice(2);
const style = 'cursor-paper', seed = 107290, phrases = 'editable-v11';
// 1.3 dB under the piano bed's -6.5 dB trim: the voice clears the bed by ~6.5 LU, as in the Cursor reference.
const bedDb = -7.8;
const dest = join(root, 'public/audio/voiceover', edition);
if (existsSync(dest)) throw new Error(`Refusing to overwrite existing bed: ${dest}`);
const settings = `handoff/${handoff}/preview-settings.json`;
const frames = Math.ceil(Object.values(JSON.parse(readFileSync(join(root, settings))).allocations).reduce((a, b) => a + b) * 30), samples = frames * 1600;
const phraseManifest = join(root, 'public/audio/voiceover', phrases, 'manifest.json');
if (JSON.parse(readFileSync(phraseManifest)).samples !== samples) throw new Error(`${phrases} phrases were placed on a different cut length`);
const work = mkdtempSync(join(tmpdir(), `ultimate3-${edition}-`)), score = join(work, 'score.wav');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
// The score owns every sound but the voice, typing included, so the preview plays exactly one music/FX bed.
execFileSync(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), 'scripts/render-ultimate3-score.ts',
  '--style', style, '--seed', String(seed), '--settings', settings, '--stems', '--out', score], {cwd: root, stdio: 'inherit'});
mkdirSync(dest, {recursive: true});
const bed = join(dest, 'bed.wav');
execFileSync('ffmpeg', ['-v', 'error', '-n', '-i', score, '-af', `volume=${bedDb}dB,apad=whole_len=${samples},atrim=end_sample=${samples},asetpts=PTS-STARTPTS`,
  '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', bed], {stdio: 'inherit'});
writeFileSync(join(dest, 'manifest.json'), JSON.stringify({version: 1, scoreStyle: style, seed, sampleRate: 48000, frames, samples,
  bed: {file: 'bed.wav', sha256: hash(bed)}, bedDb, settingsSha256: hash(join(root, settings)),
  phrases: `/audio/voiceover/${phrases}/`, phraseManifestSha256: hash(phraseManifest),
  note: `Voice-free bed (score, foley and paper-tap typing) at ${bedDb} dB; the narration stays the ${phrases} trims of the approved take.`}, null, 2) + '\n', {flag: 'wx'});
console.log(`Prepared ${dest}; stems in ${work}`);
