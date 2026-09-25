// Renders an Ultimate 3 score offline (pure Node DSP, no browser) and optionally muxes it onto a render.
//   pnpm ultimate3:score [--style tactile-glass|nocturne|signal|aria|arabesque] [--settings file.json] [--out out/ultimate3-<style>.wav]
//                        [--video out/u3-silent.mp4 --mp4 out/u3.mp4] [--stems]
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderUltimate3Score, SCORE_STYLES} from '../src/experiments/micro-18/score/render';
import {Stereo, SR} from '../src/experiments/micro-18/score/dsp';
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
  fs.writeFileSync(file, out);
}

const settingsFile = option('settings');
const settings: Ultimate3Settings = settingsFile ? JSON.parse(fs.readFileSync(resolve(settingsFile), 'utf8')) : ULTIMATE_3_DEFAULTS;
const style = option('style') ?? 'tactile-glass';
const wav = resolve(option('out') ?? (style === 'tactile-glass' ? 'out/ultimate3-score.wav' : `out/ultimate3-${style}.wav`));
const started = performance.now();
const {master, report, stems} = renderUltimate3Score(settings, loadPiano(), {style, strings: SCORE_STYLES[style]?.strings ? loadStrings() : {}, stems: args.includes('--stems')});
writeWav(wav, master);
if (stems) for (const [name, stem] of Object.entries(stems)) writeWav(wav.replace(/\.wav$/, `.${name}.wav`), stem);
console.log(JSON.stringify({...report, wav, renderSeconds: +((performance.now() - started) / 1000).toFixed(1)}, null, 2));

const video = option('video');
if (video) {
  const mp4 = resolve(option('mp4') ?? video.replace(/\.mp4$/, '-scored.mp4'));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', resolve(video), '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', mp4], {stdio: 'inherit'});
  console.log(`Muxed ${mp4}`);
}
