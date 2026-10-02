// Re-score the voice-free bed for the Animation 21 cut; the v4 bed and phrase trims stay byte-for-byte.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'public/audio/voiceover/editable-v4'), bed = join(dest, 'flow21-bed.wav');
if (existsSync(bed)) throw new Error(`Refusing to overwrite existing bed: ${bed}`);
const settingsPath = join(root, 'handoff/flow21/default-settings.json');
const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
const frames = Math.round(Object.values(settings.allocations).reduce((sum, seconds) => sum + seconds, 0) * 30), samples = frames * 1600;
const work = mkdtempSync(join(tmpdir(), 'ultimate3-flow21-bed-')), score = join(work, 'score.wav');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
execFileSync(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), 'scripts/render-ultimate3-score.ts',
  '--style', 'arabesque-acoustic-chill', '--split-arabesque', '--seed', '107290',
  '--tuning', 'handoff/voiceover-retime/tuning.json', '--settings', 'handoff/flow21/default-settings.json',
  '--out', score], {cwd: root, stdio: 'inherit'});
execFileSync('ffmpeg', ['-v', 'error', '-n', '-i', join(work, 'score.playback.wav'),
  '-af', `volume=-5.5dB,apad=whole_len=${samples},atrim=end_sample=${samples},asetpts=PTS-STARTPTS`,
  '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', bed], {stdio: 'inherit'});
const manifestPath = join(dest, 'manifest.json'), manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const {bed: previous, frames: previousFrames, samples: previousSamples, settingsSha256: previousSettings} = manifest;
writeFileSync(manifestPath, JSON.stringify({...manifest, frames, samples, bed: {file: 'flow21-bed.wav', sha256: hash(bed)},
  settingsSha256: hash(settingsPath), previousBeds: [...manifest.previousBeds ?? [], {...previous, frames: previousFrames, samples: previousSamples, settingsSha256: previousSettings}]}, null, 2) + '\n');
console.log(`Prepared ${bed} (${frames} frames)`);
