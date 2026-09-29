#!/usr/bin/env node
// Mix a rendered Ultimate3 score under the editable-v7 narration and mux it onto a silent picture.
// usage: node scripts/mix-ultimate3-concept.mjs --bed out/concepts/lumen.wav --out out/concepts/lumen-vo.mp4
//   [--video out/u3-soak-silent.mp4] [--settings handoff/voiceover-soak/default-settings.json] [--bed-db -5.5]
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const {values} = parseArgs({options: {
  bed: {type: 'string'}, out: {type: 'string'},
  video: {type: 'string', default: 'out/u3-soak-silent.mp4'},
  settings: {type: 'string', default: 'handoff/voiceover-soak/default-settings.json'},
  'bed-db': {type: 'string', default: '-5.5'},
}});
if (!values.bed || !values.out) throw new Error('--bed and --out are required');

const voiceDir = join(root, 'public/audio/voiceover/editable-v7');
const manifest = JSON.parse(readFileSync(join(voiceDir, 'manifest.json'), 'utf8'));
const raw = JSON.parse(readFileSync(resolve(root, values.settings), 'utf8'));
const placed = (raw.settings ?? raw).voiceover.phrases;
const seconds = manifest.samples / manifest.sampleRate;

// Phrases sit where the settings put them, so a retimed cut only needs a re-render of the bed.
const inputs = ['-i', resolve(root, values.bed)];
const chains = manifest.phrases.map((phrase, i) => {
  inputs.push('-i', join(voiceDir, phrase.file));
  const at = Math.round((placed[phrase.id]?.at ?? phrase.at) * 1000), length = phrase.samples / manifest.sampleRate;
  return `[${i + 1}:a]aformat=channel_layouts=stereo,afade=t=in:d=0.015,afade=t=out:st=${(length - .015).toFixed(4)}:d=0.015,adelay=${at}|${at}[v${i}]`;
});
const voices = manifest.phrases.map((_, i) => `[v${i}]`).join('');
const graph = [
  ...chains,
  `${voices}amix=inputs=${manifest.phrases.length}:normalize=0,apad=whole_dur=${seconds},atrim=0:${seconds},asplit=2[voice][key]`,
  `[0:a]aformat=channel_layouts=stereo,volume=${values['bed-db']}dB,apad=whole_dur=${seconds},atrim=0:${seconds}[bed]`,
  '[bed][key]sidechaincompress=threshold=0.02:ratio=3.5:attack=20:release=250[ducked]',
  '[ducked][voice]amix=inputs=2:normalize=0,loudnorm=I=-14.7:TP=-1:LRA=11,aresample=48000[mix]',
].join(';');

const out = resolve(root, values.out), wav = out.replace(/\.mp4$/, '.wav');
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', graph, '-map', '[mix]', '-c:a', 'pcm_s24le', wav], {stdio: 'inherit'});
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', resolve(root, values.video), '-i', wav, '-map', '0:v', '-map', '1:a',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out], {stdio: 'inherit'});
console.log(`Mixed ${values.bed} under ${manifest.phrases.length} phrases -> ${values.out}`);
