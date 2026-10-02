// Rebuild the latest v4 cut locally. Never overwrite the original soundtrack or an existing preview.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? join(root, 'public/audio/voiceover/ultimate3-voiceover-v4.wav'));
const manifestPath = output.replace(/\.wav$/, '.json');
if (!output.endsWith('.wav') || existsSync(output) || existsSync(manifestPath)) throw new Error('Choose a new .wav output path; existing audio is protected.');
const work = mkdtempSync(join(tmpdir(), 'ultimate3-voiceover-build-'));
console.log('Intermediate audio:', work);
mkdirSync(join(work, 'out'));
symlinkSync(join(root, 'handoff'), join(work, 'handoff'), 'dir');
symlinkSync(join(root, 'public'), join(work, 'public'), 'dir');
const bed = join(work, 'arabesque.wav');
execFileSync(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), 'scripts/render-ultimate3-score.ts',
  '--style', 'arabesque-acoustic-chill', '--split-arabesque', '--seed', '107290',
  '--tuning', join(here, 'tuning.json'), '--settings', join(here, 'retimed-settings.json'), '--out', bed], {cwd: root, stdio: 'inherit'});
const score = JSON.parse(readFileSync(join(work, 'arabesque.json'), 'utf8'));
const duration = Math.ceil(score.bed.duration * 30) / 30;
const sampleCount = Math.round(duration * 48000);
execFileSync(process.execPath, [join(here, 'build-vo.mjs'), String(duration)], {cwd: work, stdio: 'inherit'});
// The upstream README gives approximate mix targets, not a final mix command or exported WAV.
// Reconstruct that recipe; do not claim byte identity with its unpublished export.
const filters = '[1:a]highpass=f=75,acompressor=threshold=0.0631:ratio=2.5:attack=10:release=100,' +
  'loudnorm=I=-15.7:TP=-2:LRA=11,aresample=48000,asplit=2[voice][sidechain];' +
  '[0:a]volume=-5.5dB[bed];[bed][sidechain]sidechaincompress=threshold=0.02:ratio=3.5:attack=20:release=250[ducked];' +
  '[ducked][voice]amix=inputs=2:normalize=0,loudnorm=I=-14.7:TP=-1:LRA=11,aresample=48000,' +
  `apad=whole_len=${sampleCount},atrim=end_sample=${sampleCount},asetpts=PTS-STARTPTS[mix]`;
mkdirSync(dirname(output), {recursive: true});
execFileSync('ffmpeg', ['-v', 'error', '-n', '-i', join(work, 'arabesque.playback.wav'), '-i', join(work, 'out/vo-placed.wav'),
  '-filter_complex', filters, '-map', '[mix]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', output], {stdio: 'inherit'});
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=sample_rate,channels,duration_ts', '-of', 'json', output], {encoding: 'utf8'}));
const stream = probe.streams[0];
if (stream.sample_rate !== '48000' || stream.channels !== 2 || stream.duration_ts !== sampleCount) throw new Error('Final WAV does not match the exact video sample count.');
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
writeFileSync(manifestPath, JSON.stringify({version: 4, upstreamCommit: '9120b0847ee5cb396a90f86ff5cf0a99c2d08d85', duration, frames: Math.round(duration * 30),
  sourceRecordingSha256: sha256(join(root, 'public/audio/voiceover/Signals-launch-09-27-03-17.m4a')),
  settingsSha256: sha256(join(here, 'retimed-settings.json')), placementsSha256: sha256(join(here, 'placements.json')),
  filters, score, outputSha256: sha256(output), containsVoiceoverAndKeyboard: true,
  note: 'Exact imported visual settings and phrase placements; local reconstruction of the upstream approximate mix recipe. No live keyboard should be layered over this file.'}, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({output, manifestPath, duration, frames: Math.round(duration * 30)}, null, 2));
