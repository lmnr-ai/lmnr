// Prepare a new voice-free v4 bed and immutable phrase sources; never replace a published mix.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'public/audio/voiceover/editable-v4');
if (existsSync(dest)) throw new Error(`Refusing to overwrite existing editable sources: ${dest}`);
const placements = JSON.parse(readFileSync(join(root, 'handoff/voiceover-retime/placements.json')));
const work = mkdtempSync(join(tmpdir(), 'ultimate3-editable-v4-'));
const score = join(work, 'score.wav');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
execFileSync(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), 'scripts/render-ultimate3-score.ts',
  '--style', 'arabesque-acoustic-chill', '--split-arabesque', '--seed', '107290',
  '--tuning', 'handoff/voiceover-retime/tuning.json', '--settings', 'handoff/voiceover-retime/retimed-settings.json',
  '--out', score], {cwd: root, stdio: 'inherit'});
mkdirSync(dest, {recursive: true});
const ffmpeg = (input, filters, output) => execFileSync('ffmpeg', ['-v', 'error', '-n', '-i', input,
  '-af', filters, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', output], {stdio: 'inherit'});
const bed = join(dest, 'bed.wav');
ffmpeg(join(work, 'score.playback.wav'), 'volume=-5.5dB,apad=whole_len=3158400,atrim=end_sample=3158400,asetpts=PTS-STARTPTS', bed);
const recording = join(root, 'public/audio/voiceover/Signals-launch-09-27-03-17.m4a');
const voice = join(work, 'voice.wav');
ffmpeg(recording, 'highpass=f=75,acompressor=threshold=0.0631:ratio=2.5:attack=10:release=100,loudnorm=I=-15.7:TP=-2:LRA=11,aresample=48000', voice);
const phrases = placements.map((p, i) => {
  const file = `vo${String(i + 1).padStart(2, '0')}.wav`;
  const begin = Math.round(p.a * 48000), end = Math.round(p.b * 48000);
  ffmpeg(voice, `atrim=start_sample=${begin}:end_sample=${end},asetpts=PTS-STARTPTS`, join(dest, file));
  return {id: file.slice(0, 4), file, sha256: hash(join(dest, file)), samples: end - begin, text: p.text, a: p.a, b: p.b, at: p.at};
});
writeFileSync(join(dest, 'manifest.json'), JSON.stringify({version: 1, scoreStyle: 'arabesque-acoustic-chill', seed: 107290,
  sampleRate: 48000, frames: 1974, samples: 3158400, bed: {file: 'bed.wav', sha256: hash(bed)},
  settingsSha256: hash(join(root, 'handoff/voiceover-retime/retimed-settings.json')),
  placementsSha256: hash(join(root, 'handoff/voiceover-retime/placements.json')),
  sourceRecordingSha256: hash(recording), phrases,
  note: 'Voice-free keyboard-bearing bed at -5.5 dB; phrase sources highpass/compressed/normalized once. No baked voice-dependent ducking or final old loudnorm; not byte-identical to the preserved v4 mixed WAV.'}, null, 2) + '\n', {flag: 'wx'});
console.log(`Prepared ${dest} (${phrases.length} phrases)`);
