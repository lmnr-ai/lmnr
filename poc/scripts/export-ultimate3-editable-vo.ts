// Code-only PCM export. Pass the checked output as MicroAnimation18.audioSrc with the SAME settings JSON.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeVoiceoverSettings} from '../src/experiments/micro-18/voiceover-cut';
import {isVoiceoverBed, VOICEOVER_BED, VOICEOVER_BEDS, VOICEOVER_PHRASES, VOICEOVER_SOURCE_ROOT} from '../src/experiments/micro-18/voiceover-phrases';
import {mixVoiceoverPcm, type StereoPcm} from '../src/experiments/micro-18/voiceover-schedule';
import {ultimate3DurationFrames} from '../src/experiments/micro-18/sample';

const hash = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = (flag: string) => {const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1];};
const settingsFile = value('--settings'), out = value('--out'), bedName = value('--bed') ?? VOICEOVER_BED;
if (!settingsFile || !out || !out.endsWith('.wav')) throw new Error('Use --settings <settings.json> --out <new.wav> [--bed openai|piano]');
if (!isVoiceoverBed(bedName)) throw new Error(`Unknown bed "${bedName}". Beds: ${Object.keys(VOICEOVER_BEDS).join(', ')}`);
const output = resolve(out), manifestPath = output.replace(/\.wav$/, '.json');
if (existsSync(output) || existsSync(manifestPath)) throw new Error('Refusing to overwrite existing WAV or manifest');
// Phrases always come from editable-v11; only the bed differs, so every bed shares one narration.
const assetRoot = resolve(root, 'public', `.${VOICEOVER_SOURCE_ROOT}`), bedRoot = resolve(root, 'public', `.${VOICEOVER_BEDS[bedName]}`);
const provenance = JSON.parse(readFileSync(resolve(assetRoot, 'manifest.json'), 'utf8'));
const bedProvenance = JSON.parse(readFileSync(resolve(bedRoot, 'manifest.json'), 'utf8'));
const settingsBytes = readFileSync(resolve(settingsFile));
const settings = normalizeVoiceoverSettings(JSON.parse(settingsBytes.toString()));
const readAsset = (file: string, expectedHash: string, folder = assetRoot) => {
  const bytes = readFileSync(resolve(folder, file));
  if (hash(bytes) !== expectedHash) throw new Error(`Prepared source hash mismatch: ${file}`);
  return bytes;
};
function decodePcm24(wav: Buffer): StereoPcm {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Expected RIFF WAVE');
  let format = 0, channels = 0, sampleRate = 0, data = -1, size = 0;
  for (let at = 12; at + 8 <= wav.length;) {
    const name = wav.toString('ascii', at, at + 4), length = wav.readUInt32LE(at + 4);
    if (name === 'fmt ') {format = wav.readUInt16LE(at + 8); channels = wav.readUInt16LE(at + 10); sampleRate = wav.readUInt32LE(at + 12);
      if (format === 65534) format = wav.readUInt16LE(at + 32);}
    if (name === 'data') {data = at + 8; size = length; break;}
    at += 8 + length + (length % 2);
  }
  if (format !== 1 || channels !== 2 || sampleRate !== 48000 || data < 0 || size % 6) throw new Error('Expected stereo 48kHz PCM24');
  const l = new Float32Array(size / 6), r = new Float32Array(size / 6);
  for (let n = 0; n < l.length; n++) {l[n] = wav.readIntLE(data + n * 6, 3) / 8388608; r[n] = wav.readIntLE(data + n * 6 + 3, 3) / 8388608;}
  return {l, r};
}
function encodeFloat32(pcm: StereoPcm) {
  const bytes = Buffer.alloc(44 + pcm.l.length * 8);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(3, 20); bytes.writeUInt16LE(2, 22); bytes.writeUInt32LE(48000, 24);
  bytes.writeUInt32LE(384000, 28); bytes.writeUInt16LE(8, 32); bytes.writeUInt16LE(32, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(pcm.l.length * 8, 40);
  for (let n = 0; n < pcm.l.length; n++) {bytes.writeFloatLE(pcm.l[n], 44 + n * 8); bytes.writeFloatLE(pcm.r[n], 48 + n * 8);}
  return bytes;
}
const bed = decodePcm24(readAsset(bedProvenance.bed.file, bedProvenance.bed.sha256, bedRoot));
if (bed.l.length !== bedProvenance.samples || bedProvenance.samples !== provenance.samples) throw new Error('Frozen score sample count changed');
const sources = Object.fromEntries(VOICEOVER_PHRASES.map(phrase => {
  const record = provenance.phrases.find((entry: {id: string}) => entry.id === phrase.id);
  if (!record || record.a !== phrase.a || record.b !== phrase.b) throw new Error(`Phrase source mismatch: ${phrase.id}`);
  const pcm = decodePcm24(readAsset(record.file, record.sha256));
  if (pcm.l.length !== record.samples) throw new Error(`Phrase sample count mismatch: ${phrase.id}`);
  return [phrase.id, pcm];
}));
const audio = encodeFloat32(mixVoiceoverPcm(bed, sources, settings));
mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, audio, {flag: 'wx'});
writeFileSync(manifestPath, JSON.stringify({version: 1, videoFrames: ultimate3DurationFrames(settings), audioSamples: (audio.length - 44) / 8,
  sampleRate: 48000, channels: 2, format: 'float32', settingsSha256: hash(settingsBytes), bed: bedName,
  preparedManifestSha256: hash(readFileSync(resolve(assetRoot, 'manifest.json'))), bedManifestSha256: hash(readFileSync(resolve(bedRoot, 'manifest.json'))), outputSha256: hash(audio),
  limitation: 'Voice-free score bed is frozen at the Issue Clusters 4 cut timings; extending the composition pads silence.'}, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({output, bed: bedName, frames: ultimate3DurationFrames(settings), sha256: hash(audio)}));
