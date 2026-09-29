// Prepare the Issue Clusters 4 voice-free bed and the September 29 take's phrase sources; never replace a published mix.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'public/audio/voiceover/editable-v5');
if (existsSync(dest)) throw new Error(`Refusing to overwrite existing editable sources: ${dest}`);
const settings = 'handoff/voiceover-issues4/default-settings.json', placementsFile = 'handoff/voiceover-issues4/placements.json';
const placements = JSON.parse(readFileSync(join(root, placementsFile)));
const frames = 2276, samples = frames * 1600;
const work = mkdtempSync(join(tmpdir(), 'ultimate3-editable-v5-'));
const score = join(work, 'score.wav');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
execFileSync(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), 'scripts/render-ultimate3-score.ts',
  '--style', 'arabesque-acoustic-chill', '--split-arabesque', '--seed', '107290',
  '--tuning', 'handoff/voiceover-retime/tuning.json', '--settings', settings, '--out', score], {cwd: root, stdio: 'inherit'});
mkdirSync(dest, {recursive: true});
const ffmpeg = (input, filters, output) => execFileSync('ffmpeg', ['-v', 'error', '-n', '-i', input,
  '-af', filters, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', output], {stdio: 'inherit'});
const bed = join(dest, 'bed.wav');
ffmpeg(join(work, 'score.playback.wav'), `volume=-5.5dB,apad=whole_len=${samples},atrim=end_sample=${samples},asetpts=PTS-STARTPTS`, bed);
const recording = join(root, 'public/audio/voiceover/Signals-launch-09-29-10-04.m4a');
const voice = join(work, 'voice.wav');
ffmpeg(recording, 'highpass=f=75,acompressor=threshold=0.0631:ratio=2.5:attack=10:release=100,loudnorm=I=-15.7:TP=-2:LRA=11,aresample=48000', voice);
const phrases = placements.map((p, i) => {
  const id = `n${String(i + 1).padStart(2, '0')}`, file = `${id}.wav`;
  const begin = Math.round(p.a * 48000), end = Math.round(p.b * 48000);
  ffmpeg(voice, `atrim=start_sample=${begin}:end_sample=${end},asetpts=PTS-STARTPTS`, join(dest, file));
  return {id, file, sha256: hash(join(dest, file)), samples: end - begin, text: p.text, a: p.a, b: p.b, at: p.at};
});
writeFileSync(join(dest, 'manifest.json'), JSON.stringify({version: 1, scoreStyle: 'arabesque-acoustic-chill', seed: 107290,
  sampleRate: 48000, frames, samples, bed: {file: 'bed.wav', sha256: hash(bed)},
  settingsSha256: hash(join(root, settings)), placementsSha256: hash(join(root, placementsFile)),
  sourceRecordingSha256: hash(recording), phrases,
  note: 'Voice-free keyboard-bearing bed at -5.5 dB; phrase sources highpass/compressed/normalized once, same chain as editable-v4.'}, null, 2) + '\n', {flag: 'wx'});
console.log(`Prepared ${dest} (${phrases.length} phrases)`);
