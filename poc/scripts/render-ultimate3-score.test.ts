import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(cwd, 'node_modules/.bin/tsx');
const base = ['scripts/render-ultimate3-score.ts', '--style', 'arabesque-acoustic', '--split-arabesque'];
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {cwd, timeout: 120_000, maxBuffer: 1 << 26});
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}

test('split CLI preflights every output and invalid gain before creating any asset', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arabesque-preflight-'));
  try {
    const wav = path.join(dir, 'bed.wav');
    for (const suffix of ['.wav', '.playback.wav', '.json', '.music.wav', '.mp4']) {
      const existing = path.join(dir, `bed${suffix}`);
      fs.writeFileSync(existing, 'preserve this file');
      const result = spawnSync(cli, [...base, '--out', wav, '--stems', '--video', '/not-read.mp4', '--mp4', path.join(dir, 'bed.mp4')], {cwd, timeout: 20_000});
      assert.notEqual(result.status, 0);
      assert.match(result.stderr.toString(), /Refusing to overwrite split output/);
      assert.deepEqual(fs.readdirSync(dir), [path.basename(existing)], 'preflight must precede even the first bed write');
      assert.equal(fs.readFileSync(existing, 'utf8'), 'preserve this file');
      fs.unlinkSync(existing);
    }
    for (const extra of [['--master', 'NaN'], ['--typing-volume', '-1'], ['--seed', 'Infinity'], ['--out', path.join(dir, 'no-extension')]]) {
      const args = extra[0] === '--out' ? [...base, ...extra] : [...base, '--out', wav, ...extra];
      const result = spawnSync(cli, args, {cwd, timeout: 20_000});
      assert.notEqual(result.status, 0);
      assert.match(result.stderr.toString(), /Split (gains|seed|output)/);
      assert.deepEqual(fs.readdirSync(dir), []);
    }
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('split --video muxes the complete playback, reproduces published assets, and never overwrites them', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arabesque-mux-'));
  try {
    const video = path.join(dir, 'silent.mp4'), wav = path.join(dir, 'bed.wav'), mp4 = path.join(dir, 'scored.mp4');
    run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=128x72:r=1:d=64', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
    run(cli, [...base, '--tuning', 'src/experiments/micro-18/score/arabesque/softness-8-tuning.json', '--seed', '107290', '--out', wav, '--video', video, '--mp4', mp4]);
    const published = JSON.parse(fs.readFileSync(path.join(cwd, 'public/audio/arabesque-acoustic/ultimate3-softness-8-no-typing-v1.json'), 'utf8'));
    assert.equal(hash(fs.readFileSync(wav)), published.bed.sha256);
    const playback = path.join(dir, 'bed.playback.wav');
    assert.equal(hash(fs.readFileSync(playback)), published.playback.sha256);
    const actual = run('ffmpeg', ['-v', 'error', '-i', mp4, '-map', '0:a:0', '-c:a', 'copy', '-f', 'adts', '-']);
    const expected = run('ffmpeg', ['-v', 'error', '-i', playback, '-c:a', 'aac', '-b:a', '320k', '-f', 'adts', '-']);
    assert.equal(hash(actual), hash(expected), 'mux must contain encoded bed + thocks, not the keyboard-free bed');
    console.log(`Split mux AAC matches playback: ${hash(actual)}`);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
