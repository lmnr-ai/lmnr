// Mix a candidate score under the editable-v10 phrases; never writes into public/.
// Usage: node scripts/mix-ultimate3-candidate-vo.mjs <score.wav> <out.wav> [bed dB] [--chain approved|carve] [--video silent.mp4 --mp4 out.mp4]
// `approved` (default, bed -6.5 dB) is the published editable-v9/v10 chain: a full-band voice-keyed duck and one loudness pass.
// `carve` (bed -7.5 dB, static) never dims the whole bed: a static EQ carve, a duck on 250 Hz–5 kHz only, a lightly compressed
// and de-essed voice, and a two-pass linear loudnorm (no pumping from the normaliser either).
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), flag = name => {const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1];};
const [score, out, bedArg] = args.filter((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!score || !out?.endsWith('.wav')) throw new Error('Use <score.wav> <out.wav> [bed dB] [--chain approved|carve] [--video silent.mp4 --mp4 out.mp4]');
if (resolve(out).startsWith(join(root, 'public'))) throw new Error('Candidate mixes stay outside public/');
for (const file of [out, flag('--mp4')].filter(Boolean)) if (existsSync(file)) throw new Error(`Refusing to overwrite ${file}`);
const chain = flag('--chain') ?? 'approved';
if (!['approved', 'carve'].includes(chain)) throw new Error(`Unknown chain ${chain}`);
const bedDb = Number(bedArg ?? (chain === 'carve' ? -7.5 : -6.5)), sources = join(root, 'public/audio/voiceover/editable-v10');
const manifest = JSON.parse(readFileSync(join(sources, 'manifest.json'), 'utf8'));
const inputs = [score, ...manifest.phrases.map(p => join(sources, p.file))].flatMap(file => ['-i', file]);
const voices = manifest.phrases.map((p, i) => {
  const length = p.samples / manifest.sampleRate, delay = Math.round(p.at * 1000);
  return `[${i + 1}]afade=t=in:d=0.015,afade=t=out:st=${(length - .015).toFixed(4)}:d=0.015,adelay=${delay}|${delay}[v${i}]`;
});
const pad = `apad=whole_len=${manifest.samples},atrim=end_sample=${manifest.samples}`;
const voiceSum = `${manifest.phrases.map((_, i) => `[v${i}]`).join('')}amix=inputs=${manifest.phrases.length}:normalize=0,${pad}`;
const graph = loudness => [
  ...voices,
  ...(chain === 'approved' ? [
    `[0]aresample=48000,volume=${bedDb}dB,${pad}[bed]`,
    `${voiceSum},asplit[voice][key]`,
    '[bed][key]sidechaincompress=threshold=0.02:ratio=3.5:attack=20:release=250[ducked]',
  ] : [
    // The carve: -3 dB at the voice's body (380 Hz) and -2 dB at its presence (2.8 kHz), always, so nothing has to move.
    `[0]aresample=48000,volume=${bedDb}dB,equalizer=f=380:t=q:w=1.0:g=-3,equalizer=f=2800:t=q:w=1.3:g=-2,highshelf=f=9000:g=-2,${pad},acrossover=split=250 5000[low][mid][high]`,
    `${voiceSum},highpass=f=90,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,highshelf=f=3500:g=2,deesser=i=0.4:f=0.27,asplit[voice][raw]`,
    '[raw]highpass=f=250[key]',
    // Only the voice's own band ducks (a few dB): the 808 and the hats never move.
    '[mid][key]sidechaincompress=threshold=0.05:ratio=2:knee=6:attack=8:release=350[midDucked]',
    '[low][midDucked][high]amix=inputs=3:normalize=0[ducked]',
  ]),
  `[ducked][voice]amix=inputs=2:normalize=0,${loudness},aresample=48000[out]`,
].join(';');
const render = loudness => ['-hide_banner', '-nostats', '-n', ...inputs, '-filter_complex', graph(loudness), '-map', '[out]', '-ac', '2'];
let loudness = 'loudnorm=I=-14.7:TP=-1:LRA=11';
if (chain === 'carve') {
  // Pass one measures; pass two applies one static gain (linear=true), so the normaliser adds no movement of its own.
  const probe = spawnSync('ffmpeg', [...render(`${loudness}:print_format=json`), '-f', 'null', '-'], {encoding: 'utf8'});
  const measured = JSON.parse(probe.stderr.slice(probe.stderr.lastIndexOf('{')));
  loudness += `:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
}
execFileSync('ffmpeg', ['-v', 'error', ...render(loudness), '-c:a', 'pcm_s24le', out], {stdio: 'inherit'});
if (flag('--video') && flag('--mp4')) execFileSync('ffmpeg', ['-v', 'error', '-n', '-i', flag('--video'), '-i', out,
  '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', flag('--mp4')], {stdio: 'inherit'});
console.log(JSON.stringify({out, mp4: flag('--mp4') ?? null, chain, bedDb, phrases: manifest.phrases.length}));
