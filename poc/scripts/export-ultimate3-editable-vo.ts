// Code-only PCM export. Pass the checked output as MicroAnimation18.audioSrc with the SAME settings JSON.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, posix, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeVoiceoverSettings} from '../src/experiments/micro-18/voiceover-cut';
import {VOICEOVER_BEDS, VOICEOVER_PHRASES, VOICEOVER_SOURCE_ROOT, type VoiceoverBedId} from '../src/experiments/micro-18/voiceover-phrases';
import {mixVoiceoverPcm} from '../src/experiments/micro-18/voiceover-schedule';
import {ultimate3DurationFrames} from '../src/experiments/micro-18/sample';
import {decodePcm24, encodeFloat32} from './voiceover-pcm';

const hash = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = (flag: string) => {const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1];};
const settingsFile = value('--settings'), out = value('--out');
if (!settingsFile || !out || !out.endsWith('.wav')) throw new Error('Use --settings <settings.json> --out <new.wav> [--bed arabesque|glide|glide-minimal|glide-minimal-lift|glide-minimal-linger|glide-arc|cursor-v3|cursor-v4]');
const bedId = (value('--bed') ?? 'arabesque') as VoiceoverBedId;
if (!Object.hasOwn(VOICEOVER_BEDS, bedId)) throw new Error(`Unknown bed "${bedId}". Available: ${Object.keys(VOICEOVER_BEDS).join(', ')}`);
const output = resolve(out), manifestPath = output.replace(/\.wav$/, '.json');
if (existsSync(output) || existsSync(manifestPath)) throw new Error('Refusing to overwrite existing WAV or manifest');
const assetRoot = resolve(root, 'public', `.${VOICEOVER_SOURCE_ROOT}`);
const provenance = JSON.parse(readFileSync(resolve(assetRoot, 'manifest.json'), 'utf8'));
const settingsBytes = readFileSync(resolve(settingsFile));
const settings = normalizeVoiceoverSettings(JSON.parse(settingsBytes.toString()));
const readAsset = (file: string, expectedHash: string, folder = assetRoot) => {
  const bytes = readFileSync(resolve(folder, file));
  if (hash(bytes) !== expectedHash) throw new Error(`Prepared source hash mismatch: ${file}`);
  return bytes;
};
// Alternate beds keep their own manifest beside the bed and share the approved phrase sources.
const bedRoot = resolve(root, 'public', `.${posix.dirname(VOICEOVER_BEDS[bedId].url)}`);
const bedManifestPath = resolve(bedRoot, 'manifest.json'), bedManifest = JSON.parse(readFileSync(bedManifestPath, 'utf8'));
if (bedRoot !== assetRoot && bedManifest.phraseManifestSha256 !== hash(readFileSync(resolve(assetRoot, 'manifest.json')))) throw new Error('Bed was built for other phrase sources');
const bed = decodePcm24(readAsset(bedManifest.bed.file, bedManifest.bed.sha256, bedRoot));
if (bed.l.length !== bedManifest.samples) throw new Error('Frozen score sample count changed');
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
  sampleRate: 48000, channels: 2, format: 'float32', settingsSha256: hash(settingsBytes),
  preparedManifestSha256: hash(readFileSync(resolve(assetRoot, 'manifest.json'))), bed: bedId, bedManifestSha256: hash(readFileSync(bedManifestPath)), outputSha256: hash(audio),
  limitation: 'Voice-free score bed is frozen at the Issue Clusters 4 cut timings; extending the composition pads silence.'}, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({output, bed: bedId, frames: ultimate3DurationFrames(settings), sha256: hash(audio)}));
