// Renders an Ultimate 3 score offline (pure Node DSP, no browser) and optionally muxes it onto a render.
//   pnpm ultimate3:score [--style tactile-glass|nocturne|signal|aria|arabesque|<style>-acoustic|nocturne-duet|nocturne-digital|phase|tintinnabuli] [--settings file.json] [--out out/ultimate3-<style>.wav]
//                        [--keyboard thock|laptop|clack|spring|membrane]
//                        [--video out/u3-silent.mp4 --mp4 out/u3.mp4] [--stems] [--tuning arabesque-acoustic-tuning.json]
//                        [--layers sub=1,keys=.8 | --layers layers.json] [--gain 0.5] [--no-typing]   (layered styles, e.g. openai-pulse)
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderUltimate3Score, SCORE_STYLES} from '../src/experiments/micro-18/score/render';
import {Stereo, SR, integratedLufs, truePeak, toDb} from '../src/experiments/micro-18/score/dsp';
import {mixArabesquePlayback, ARABESQUE_BED_CALIBRATION, ARABESQUE_THOCK_TRIM} from '../src/experiments/micro-18/arabesque-playback';
import {normalizeEffectTuning} from '../src/experiments/micro-18/score/tuning';
import type {PianoBank, StringBanks, StringSection} from '../src/experiments/micro-18/score/voices';
import {ULTIMATE_3_DEFAULTS, type Ultimate3Settings} from '../src/experiments/micro-18/settings';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const resolve = (file: string) => path.resolve(process.cwd(), file);

/** Decode a manifest-listed bank, starting every note on its transient (MP3 decoders pad the head) so chords land together. */
function loadBank<T extends {name: string; midi: number}>(folder: string) {
  const directory = path.join(root, 'sound-sources', folder);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'source-manifest.json'), 'utf8')) as {files: T[]};
  return manifest.files.map(file => {
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(directory, file.name), '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], {maxBuffer: 1 << 28});
    const data = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    let start = 0;
    while (start < data.length && Math.abs(data[start]) < .003) start++;
    return {...file, data: data.slice(Math.max(0, start - 24))};
  });
}
const loadPiano = (): PianoBank => loadBank('salamander-tonejs');
/** VSCO sections were recorded at unrelated gains: level every sustain's body so the two layers sit ~8 dB apart, and every pluck's peak. */
function loadStrings(): StringBanks {
  const banks: Record<string, StringBanks[StringSection]> = {};
  for (const note of loadBank<{name: string; midi: number; instrument: StringSection; dynamic: 'soft' | 'loud'}>('vsco2-strings')) {
    const body = note.data.subarray(SR, SR * 2.5);
    const level = note.instrument === 'pizz' ? note.data.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0) : Math.sqrt(body.reduce((sum, value) => sum + value * value, 0) / body.length);
    const gain = 10 ** ((note.instrument === 'pizz' ? -10 : note.dynamic === 'loud' ? -24 : -32) / 20) / level;
    for (let n = 0; n < note.data.length; n++) note.data[n] *= gain;
    banks[note.instrument] = [...banks[note.instrument] ?? [], note];
  }
  return banks;
}

function writeWav(file: string, audio: Stereo) {
  const bytes = audio.length * 2 * 3;
  const out = Buffer.alloc(44 + bytes);
  out.write('RIFF', 0); out.writeUInt32LE(36 + bytes, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * 6, 28); out.writeUInt16LE(6, 32); out.writeUInt16LE(24, 34); out.write('data', 36); out.writeUInt32LE(bytes, 40);
  let offset = 44;
  for (let n = 0; n < audio.length; n++) for (const channel of [audio.l, audio.r]) {
    out.writeIntLE(Math.round(Math.max(-1, Math.min(1, channel[n])) * 8_388_607), offset, 3); offset += 3;
  }
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, out, {flag: split ? 'wx' : 'w'});
}

const settingsFile = option('settings');
const settings: Ultimate3Settings = settingsFile ? JSON.parse(fs.readFileSync(resolve(settingsFile), 'utf8')) : ULTIMATE_3_DEFAULTS;
const style = option('style') ?? 'tactile-glass';
const tuningFile = option('tuning');
const tuning = tuningFile ? JSON.parse(fs.readFileSync(resolve(tuningFile), 'utf8')) : undefined;
const wav = resolve(option('out') ?? (style === 'tactile-glass' ? 'out/ultimate3-score.wav' : `out/ultimate3-${style}.wav`));
// --split-arabesque writes a typing-free bed plus an exact live-mix export and provenance.
const split = args.includes('--split-arabesque');
if (split && !style.startsWith('arabesque-acoustic')) throw new Error('--split-arabesque requires an arabesque-acoustic style');
const playbackPath = wav.replace(/\.wav$/, '.playback.wav');
const manifestPath = wav.replace(/\.wav$/, '.json');
const video = option('video');
const mp4 = video ? resolve(option('mp4') ?? video.replace(/\.mp4$/, '-scored.mp4')) : undefined;
const seed = Number(option('seed') ?? 0x1a31a);
// Layer gains for styles that name their layers: `name=gain,...` or a JSON object file. `--gain` fixes the master gain
// (no loudness normalisation or limiter) so solo renders of each layer sum to the full mix.
const layersOption = option('layers');
const layers: Record<string, number> | undefined = layersOption === undefined ? undefined : layersOption.endsWith('.json')
  ? JSON.parse(fs.readFileSync(resolve(layersOption), 'utf8'))
  : Object.fromEntries(layersOption.split(',').map(pair => { const [name, value] = pair.split('='); return [name, Number(value)]; }));
for (const [name, value] of Object.entries(layers ?? {})) if (!Number.isFinite(value) || value < 0) throw new Error(`Layer "${name}" needs a finite nonnegative gain`);
const gainOption = option('gain'), gain = gainOption === undefined ? undefined : Number(gainOption);
if (gain !== undefined && !(Number.isFinite(gain) && gain > 0)) throw new Error('--gain must be a positive number');
const masterVolume = Number(option('master') ?? 6.98), typingVolume = Number(option('typing-volume') ?? 1);
if (split) {
  if (!wav.endsWith('.wav')) throw new Error('Split output must end in .wav');
  if (!Number.isSafeInteger(seed)) throw new Error('Split seed must be a finite integer');
  if (![masterVolume, typingVolume].every(value => Number.isFinite(value) && value >= 0)) throw new Error('Split gains must be finite and nonnegative');
  const outputs = [wav, playbackPath, manifestPath, ...(mp4 ? [mp4] : []),
    ...(args.includes('--stems') ? ['music', 'sfx', 'hall', 'room', 'delay'].map(name => wav.replace(/\.wav$/, `.${name}.wav`)) : [])];
  if (new Set(outputs).size !== outputs.length) throw new Error('Split output paths must be distinct');
  for (const file of outputs) if (fs.existsSync(file)) throw new Error(`Refusing to overwrite split output: ${file}`);
}
const started = performance.now();
const {master, report, stems, cues} = renderUltimate3Score(settings, SCORE_STYLES[style]?.keys ? [] : loadPiano(), {style, keyboard: option('keyboard'), strings: SCORE_STYLES[style]?.strings ? loadStrings() : {}, stems: args.includes('--stems'), tuning, seed, typing: !split && !args.includes('--no-typing'), layers, gain});
writeWav(wav, master);
if (split) {
  // Decode the published 24-bit bed: exports sum the exact samples the browser loads.
  const bytes = execFileSync('ffmpeg', ['-v', 'error', '-i', wav, '-f', 'f32le', '-'], {maxBuffer: 1 << 28});
  const data = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  for (let n = 0; n < master.length; n++) { master.l[n] = data[2 * n]; master.r[n] = data[2 * n + 1]; }
  const mixed = mixArabesquePlayback(master, settings, masterVolume, typingVolume);
  const playback = new Stereo(master.length); playback.l.set(mixed.l); playback.r.set(mixed.r);
  writeWav(playbackPath, playback);
  const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const manifest = {version: 1, style, seed, sampleRate: SR, channels: 2, bitDepth: 24,
    settings, tuning: normalizeEffectTuning(tuning), typingInBed: false, typingEvents: cues.issues.typingEvents,
    sourceCalibration: ARABESQUE_BED_CALIBRATION, thockTrim: ARABESQUE_THOCK_TRIM, masterVolume, typingVolume,
    bed: {file: path.basename(wav), sha256: hash(wav), ...report},
    playback: {file: path.basename(playbackPath), sha256: hash(playbackPath), lufs: integratedLufs(playback), truePeakDb: toDb(truePeak(playback))},
    sources: ['salamander-tonejs/source-manifest.json'].map(file => ({file, sha256: hash(path.join(root, 'sound-sources', file))})),
    limitation: 'Only live typing follows editor retimes. Rerender the frozen music/FX bed for other timing changes. musicVolume is the legacy Sangers control, not Arabesque.'};
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'});
}
if (stems) for (const [name, stem] of Object.entries(stems)) writeWav(wav.replace(/\.wav$/, `.${name}.wav`), stem);
console.log(JSON.stringify({...report, wav, renderSeconds: +((performance.now() - started) / 1000).toFixed(1)}, null, 2));

if (video && mp4) {
  // Split exports must mux the complete bed + keyboard, never the typing-free bed.
  execFileSync('ffmpeg', ['-v', 'error', split ? '-n' : '-y', '-i', resolve(video), '-i', split ? playbackPath : wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', mp4], {stdio: 'inherit'});
  console.log(`Muxed ${mp4}`);
}
