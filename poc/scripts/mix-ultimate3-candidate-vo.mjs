// Mix a candidate score under the editable-v10 phrases with the published voiceover chain; never writes into public/.
// Usage: node scripts/mix-ultimate3-candidate-vo.mjs <score.wav> <out.wav> [bed dB, default -6.5] [--video silent.mp4 --mp4 out.mp4]
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), flag = name => {const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1];};
const [score, out, bedArg] = args.filter((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!score || !out?.endsWith('.wav')) throw new Error('Use <score.wav> <out.wav> [bed dB] [--video silent.mp4 --mp4 out.mp4]');
if (resolve(out).startsWith(join(root, 'public'))) throw new Error('Candidate mixes stay outside public/');
for (const file of [out, flag('--mp4')].filter(Boolean)) if (existsSync(file)) throw new Error(`Refusing to overwrite ${file}`);
const bedDb = Number(bedArg ?? -6.5), sources = join(root, 'public/audio/voiceover/editable-v10');
const manifest = JSON.parse(readFileSync(join(sources, 'manifest.json'), 'utf8'));
// Same chain as the published editable-v9/v10 renders: 15ms phrase fades, voice-keyed duck, one loudness pass.
const inputs = [score, ...manifest.phrases.map(p => join(sources, p.file))].flatMap(file => ['-i', file]);
const voices = manifest.phrases.map((p, i) => {
  const length = p.samples / manifest.sampleRate, delay = Math.round(p.at * 1000);
  return `[${i + 1}]afade=t=in:d=0.015,afade=t=out:st=${(length - .015).toFixed(4)}:d=0.015,adelay=${delay}|${delay}[v${i}]`;
});
const filter = [
  `[0]aresample=48000,volume=${bedDb}dB,apad=whole_len=${manifest.samples},atrim=end_sample=${manifest.samples}[bed]`,
  ...voices,
  `${manifest.phrases.map((_, i) => `[v${i}]`).join('')}amix=inputs=${manifest.phrases.length}:normalize=0,apad=whole_len=${manifest.samples},atrim=end_sample=${manifest.samples},asplit[voice][key]`,
  '[bed][key]sidechaincompress=threshold=0.02:ratio=3.5:attack=20:release=250[ducked]',
  '[ducked][voice]amix=inputs=2:normalize=0,loudnorm=I=-14.7:TP=-1:LRA=11,aresample=48000[out]',
].join(';');
execFileSync('ffmpeg', ['-v', 'error', '-n', ...inputs, '-filter_complex', filter, '-map', '[out]', '-ac', '2', '-c:a', 'pcm_s24le', out], {stdio: 'inherit'});
if (flag('--video') && flag('--mp4')) execFileSync('ffmpeg', ['-v', 'error', '-n', '-i', flag('--video'), '-i', out,
  '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', flag('--mp4')], {stdio: 'inherit'});
console.log(JSON.stringify({out, mp4: flag('--mp4') ?? null, bedDb, phrases: manifest.phrases.length}));
