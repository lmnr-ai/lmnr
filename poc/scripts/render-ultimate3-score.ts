// Renders an Ultimate 3 score offline (pure Node DSP, no browser) and optionally muxes it onto a render.
//   pnpm ultimate3:score [--style tactile-glass|nocturne|signal] [--settings file.json] [--out out/ultimate3-<style>.wav]
//                        [--video out/u3-silent.mp4 --mp4 out/u3.mp4] [--stems]
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderUltimate3Score} from '../src/experiments/micro-18/score/render';
import {Stereo, SR} from '../src/experiments/micro-18/score/dsp';
import type {PianoBank} from '../src/experiments/micro-18/score/voices';
import {ULTIMATE_3_DEFAULTS, type Ultimate3Settings} from '../src/experiments/micro-18/settings';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const resolve = (file: string) => path.resolve(process.cwd(), file);

function loadPiano(): PianoBank {
  const directory = path.join(root, 'sound-sources/salamander-tonejs');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'source-manifest.json'), 'utf8')) as {files: {name: string; midi: number}[]};
  return manifest.files.map(({name, midi}) => {
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(directory, name), '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], {maxBuffer: 1 << 28});
    const data = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    // MP3 decoders pad the head; start every note on its transient so chords land together.
    let start = 0;
    while (start < data.length && Math.abs(data[start]) < .003) start++;
    return {midi, data: data.slice(Math.max(0, start - 24))};
  });
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
const {master, report, stems} = renderUltimate3Score(settings, loadPiano(), {style, stems: args.includes('--stems')});
writeWav(wav, master);
if (stems) for (const [name, stem] of Object.entries(stems)) writeWav(wav.replace(/\.wav$/, `.${name}.wav`), stem);
console.log(JSON.stringify({...report, wav, renderSeconds: +((performance.now() - started) / 1000).toFixed(1)}, null, 2));

const video = option('video');
if (video) {
  const mp4 = resolve(option('mp4') ?? video.replace(/\.mp4$/, '-scored.mp4'));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', resolve(video), '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', mp4], {stdio: 'inherit'});
  console.log(`Muxed ${mp4}`);
}
