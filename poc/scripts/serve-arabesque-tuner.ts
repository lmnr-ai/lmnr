import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderEffectPreview} from '../src/experiments/micro-18/score/preview';
import {renderUltimate3Score} from '../src/experiments/micro-18/score/render';
import {SR, type Stereo} from '../src/experiments/micro-18/score/dsp';
import {DEFAULT_EFFECT_TUNING, EFFECT_PANELS, MIX_CONTROLS, normalizeEffectTuning, type EffectKind} from '../src/experiments/micro-18/score/tuning';
import type {PianoBank} from '../src/experiments/micro-18/score/voices';
import {ULTIMATE_3_DEFAULTS} from '../src/experiments/micro-18/settings';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staticRoot = path.join(root, 'arabesque-tuner');
const outputRoot = path.join(root, 'out', 'arabesque-tuner');
const port = Number(process.env.PORT ?? 5181);
fs.mkdirSync(outputRoot, {recursive: true});

function loadPiano(): PianoBank {
  const directory = path.join(root, 'sound-sources', 'salamander-tonejs');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'source-manifest.json'), 'utf8')) as {files: {name: string; midi: number}[]};
  return manifest.files.map(file => {
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(directory, file.name), '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], {maxBuffer: 1 << 28});
    const data = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    let start = 0;
    while (start < data.length && Math.abs(data[start]) < .003) start++;
    return {midi: file.midi, data: data.slice(Math.max(0, start - 24))};
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
  fs.writeFileSync(file, out);
}

const mime: Record<string, string> = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wav': 'audio/wav'};
const json = (response: http.ServerResponse, status: number, value: unknown) => {
  response.writeHead(status, {'content-type': 'application/json; charset=utf-8'});
  response.end(JSON.stringify(value));
};
const bodyOf = (request: http.IncomingMessage) => new Promise<unknown>((resolve, reject) => {
  const chunks: Buffer[] = []; let size = 0;
  request.on('data', chunk => { size += chunk.length; if (size > 1_000_000) request.destroy(new Error('Request too large')); else chunks.push(chunk); });
  request.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (error) { reject(error); } });
  request.on('error', reject);
});

console.log('Loading Salamander piano samples…');
const piano = loadPiano();
console.log(`Loaded ${piano.length} piano samples.`);

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `localhost:${port}`}`);
  try {
    if (request.method === 'GET' && url.pathname === '/api/config') {
      return json(response, 200, {defaults: DEFAULT_EFFECT_TUNING, panels: EFFECT_PANELS, mixControls: MIX_CONTROLS});
    }
    if (request.method === 'POST' && url.pathname === '/api/render') {
      const payload = await bodyOf(request) as {mode?: string; effect?: string; tuning?: unknown};
      const tuning = normalizeEffectTuning(payload.tuning);
      const effect = EFFECT_PANELS.some(panel => panel.id === payload.effect) ? payload.effect as EffectKind : undefined;
      const mode = payload.mode === 'effect' && effect ? 'effect' : 'full';
      const hash = createHash('sha256').update(JSON.stringify({mode, effect, tuning})).digest('hex').slice(0, 16);
      const file = `${mode}-${effect ?? 'arabesque-acoustic'}-${hash}.wav`;
      const destination = path.join(outputRoot, file);
      let report: unknown;
      const started = performance.now();
      if (!fs.existsSync(destination)) {
        if (mode === 'effect' && effect) writeWav(destination, renderEffectPreview(effect, piano, tuning));
        else {
          const rendered = renderUltimate3Score(ULTIMATE_3_DEFAULTS, piano, {style: 'arabesque-acoustic', tuning});
          writeWav(destination, rendered.master);
          report = rendered.report;
        }
      }
      return json(response, 200, {audio: `/audio/${file}`, cached: performance.now() - started < 20, renderSeconds: +((performance.now() - started) / 1000).toFixed(1), report});
    }
    if (request.method === 'GET' && url.pathname.startsWith('/audio/')) {
      const file = path.join(outputRoot, path.basename(url.pathname));
      if (!fs.existsSync(file)) return json(response, 404, {error: 'Audio not found'});
      response.writeHead(200, {'content-type': 'audio/wav', 'content-length': fs.statSync(file).size, 'cache-control': 'public, max-age=31536000, immutable'});
      return fs.createReadStream(file).pipe(response);
    }
    if (request.method === 'GET') {
      const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const file = path.resolve(staticRoot, requested);
      if (!file.startsWith(`${staticRoot}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return json(response, 404, {error: 'Not found'});
      response.writeHead(200, {'content-type': mime[path.extname(file)] ?? 'application/octet-stream'});
      return fs.createReadStream(file).pipe(response);
    }
    return json(response, 405, {error: 'Method not allowed'});
  } catch (error) {
    console.error(error);
    return json(response, 500, {error: error instanceof Error ? error.message : String(error)});
  }
});

server.listen(port, () => console.log(`Arabesque Acoustic tuner: http://localhost:${port}`));
