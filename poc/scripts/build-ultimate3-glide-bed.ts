// Build the Glide (TurboPuffer-reference) bed for the approved editable-v11 narration; never replaces a bed.
//   pnpm exec tsx scripts/build-ultimate3-glide-bed.ts [--settings handoff/pricing-timing-audio/preview-settings.json]
//     [--seed 2316] [--out public/audio/voiceover/editable-v11-glide]
// The voice ducking is baked here, keyed by the placed narration itself, so the browser preview (bed +
// phrases at unity) and the export (mixVoiceoverPcm) are the same sum with no live compressor.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ARABESQUE_THOCK_TRIM} from '../src/experiments/micro-18/arabesque-playback';
import {Stereo, Svf, db, integratedLufs, toDb, truePeak} from '../src/experiments/micro-18/score/dsp';
import {renderUltimate3Score} from '../src/experiments/micro-18/score/render';
import {renderThockKeystroke} from '../src/experiments/micro-18/thock-typing';
import {ultimate3TypingTickEvents} from '../src/experiments/micro-18/typing-audio';
import {normalizeVoiceoverSettings} from '../src/experiments/micro-18/voiceover-cut';
import {VOICEOVER_PHRASES, VOICEOVER_SOURCE_ROOT} from '../src/experiments/micro-18/voiceover-phrases';
import {mixVoiceoverPcm, voiceoverSchedule, type StereoPcm} from '../src/experiments/micro-18/voiceover-schedule';
import {decodePcm24, encodePcm24} from './voiceover-pcm';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');

const settingsPath = resolve(option('settings') ?? join(root, 'handoff/pricing-timing-audio/preview-settings.json'));
const seed = Number(option('seed') ?? 2316);
const dest = resolve(option('out') ?? join(root, 'public/audio/voiceover/editable-v11-glide'));
for (const file of ['bed.wav', 'manifest.json']) if (existsSync(join(dest, file))) throw new Error(`Refusing to overwrite ${join(dest, file)}`);

/** Integrated bed level relative to the narration's (the reference sits ~7 dB under its voice). */
const BED_UNDER_VOICE_DB = 7;
/** Full-band duck while speaking, and an extra dip of the bed's 1–4 kHz presence band. */
const DUCK_DB = 5, PRESENCE_DB = 6;
const LOOKAHEAD = .04, ATTACK = .06, RELEASE = .35, GATE_DB = -42;
/** Sample-peak ceiling for bed + voice; 4x-oversampled true peak lands ≤ -1 dBTP. */
const CEILING_DB = -1.6;
/** The v11 bed's keyboard level: live thock trim × master 6.98, then that bed's -6.5 dB trim. */
const THOCK_GAIN = ARABESQUE_THOCK_TRIM * 6.98 * db(-6.5);

const settingsBytes = readFileSync(settingsPath);
const settings = normalizeVoiceoverSettings(JSON.parse(settingsBytes.toString()));

// Phrases: the approved editable-v11 sources, hash-checked, at the settings' placements.
const phraseRoot = join(root, 'public', VOICEOVER_SOURCE_ROOT);
const phraseManifestBytes = readFileSync(join(phraseRoot, 'manifest.json'));
const phraseManifest = JSON.parse(phraseManifestBytes.toString());
const sources = Object.fromEntries(VOICEOVER_PHRASES.map(phrase => {
  const record = phraseManifest.phrases.find((entry: {id: string}) => entry.id === phrase.id);
  const bytes = readFileSync(join(phraseRoot, record.file));
  if (hash(bytes) !== record.sha256) throw new Error(`Phrase hash mismatch: ${phrase.id}`);
  return [phrase.id, decodePcm24(bytes)];
}));

const {master: score, report} = renderUltimate3Score(settings, [], {style: 'glide', seed, typing: false});
const length = phraseManifest.samples as number;
if (score.length !== length) throw new Error(`Score is ${score.length} samples, the v11 cut is ${length}`);
const silent = {l: new Float32Array(length), r: new Float32Array(length)};
const voice = mixVoiceoverPcm(silent, sources, settings);
const stereo = (pcm: StereoPcm) => { const out = new Stereo(length); out.l.set(pcm.l.subarray(0, length)); out.r.set(pcm.r.subarray(0, length)); return out; };
const voiceLufs = integratedLufs(stereo(voice));

// Sidechain key: 10 ms RMS of the placed voice, gated, smoothed, and led by LOOKAHEAD so the dip
// is already down when a consonant starts.
const window = 480, key = new Float32Array(length);
let energy = 0;
for (let n = 0; n < length; n++) {
  const value = (voice.l[n] + voice.r[n]) / 2;
  energy += value * value;
  if (n >= window) { const old = (voice.l[n - window] + voice.r[n - window]) / 2; energy -= old * old; }
  key[n] = toDb(Math.sqrt(Math.max(0, energy) / window)) > GATE_DB ? 1 : 0;
}
const duck = new Float32Array(length), lead = Math.round(LOOKAHEAD * 48_000);
const up = 1 - Math.exp(-1 / (ATTACK * 48_000)), down = 1 - Math.exp(-1 / (RELEASE * 48_000));
for (let n = 0, state = 0; n < length; n++) {
  const target = key[Math.min(length - 1, n + lead)];
  state += (target - state) * (target > state ? up : down);
  duck[n] = state;
}

const bed = new Stereo(length);
const presence = [new Svf(), new Svf()];
for (let n = 0; n < length; n++) {
  const gain = db(-DUCK_DB * duck[n]), dip = (1 - db(-PRESENCE_DB)) * duck[n];
  bed.l[n] = (score.l[n] - dip * (presence[0].process(score.l[n], 2200, .55), presence[0].bp)) * gain;
  bed.r[n] = (score.r[n] - dip * (presence[1].process(score.r[n], 2200, .55), presence[1].bp)) * gain;
}
const trim = db(voiceLufs - BED_UNDER_VOICE_DB - integratedLufs(bed));
for (let n = 0; n < length; n++) { bed.l[n] *= trim; bed.r[n] *= trim; }
const scoreLufs = integratedLufs(bed);

// The shared keyboard, after the duck so typing under n21 keeps the approved level.
for (const event of ultimate3TypingTickEvents(settings)) {
  const pcm = renderThockKeystroke(event.voice ?? 0), start = Math.round(event.time * 48_000);
  for (let n = 0; n < pcm.left.length && start + n < length; n++) {
    bed.l[start + n] += pcm.left[n] * THOCK_GAIN; bed.r[start + n] += pcm.right[n] * THOCK_GAIN;
  }
}

// Voice-aware safety: dip the bed (never the voice) wherever the sum would pass the ceiling; the
// voice's own peaks are left to the approved phrases.
const ceiling = db(CEILING_DB), need = new Float32Array(length).fill(1);
for (let n = 0; n < length; n++) for (const [v, b] of [[voice.l[n], bed.l[n]], [voice.r[n], bed.r[n]]])
  if (Math.abs(v) < ceiling && Math.abs(v + b) > ceiling) need[n] = Math.min(need[n], Math.max(0, (ceiling - Math.abs(v)) / Math.abs(b)));
const safety = new Float32Array(length);
const attack = 1 - Math.exp(-1 / (.002 * 48_000)), recover = 1 - Math.exp(-1 / (.08 * 48_000));
for (let n = length - 1, g = 1; n >= 0; n--) { g = Math.min(need[n], g + (1 - g) * attack); safety[n] = g; }
let safetyDb = 0;
for (let n = 0, g = 1; n < length; n++) {
  g = Math.min(safety[n], g + (1 - g) * recover);
  bed.l[n] *= g; bed.r[n] *= g; safetyDb = Math.min(safetyDb, toDb(g));
}

const bedBytes = encodePcm24(bed);
const decoded = decodePcm24(bedBytes);
const mixed = stereo(mixVoiceoverPcm(decoded, sources, settings));
const speaking = voiceoverSchedule(settings).reduce((sum, phrase) => sum + phrase.duration, 0);
mkdirSync(dest, {recursive: true});
writeFileSync(join(dest, 'bed.wav'), bedBytes, {flag: 'wx'});
const manifest = {
  version: 1, scoreStyle: 'glide', seed, sampleRate: 48000, frames: length / 1600, samples: length,
  bed: {file: 'bed.wav', sha256: hash(bedBytes)},
  settingsSha256: hash(settingsBytes), phraseRoot: VOICEOVER_SOURCE_ROOT, phraseManifestSha256: hash(phraseManifestBytes),
  ducking: {keyedBy: 'placed editable-v11 phrases', duckDb: DUCK_DB, presenceDb: PRESENCE_DB, presenceHz: 2200, lookahead: LOOKAHEAD, attack: ATTACK, release: RELEASE, gateDb: GATE_DB},
  levels: {
    voiceLufs, scoreLufs, bedUnderVoiceDb: BED_UNDER_VOICE_DB, thockGain: THOCK_GAIN, scoreLimiterDb: report.limiterDb, bedSafetyDb: safetyDb,
    bedTruePeakDb: toDb(truePeak(stereo(decoded))), mixLufs: integratedLufs(mixed), mixTruePeakDb: toDb(truePeak(mixed)), speakingSeconds: speaking,
  },
  note: 'Voice-free keyboard-bearing bed, ducked under the placed narration at these settings. Moving a phrase far from its placement leaves the bed dip where it was; rebuild the bed for a new cut.',
};
writeFileSync(join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({dest, ...manifest.levels, counts: report.counts}, null, 2));
