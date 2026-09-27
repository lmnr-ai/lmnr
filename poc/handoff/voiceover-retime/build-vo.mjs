import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const placed = JSON.parse(readFileSync('handoff/voiceover-retime/placements.json', 'utf8'));
const total = Number(process.argv[2]);
const parts = placed.map((p, i) => {
  const d = +(p.b - p.a).toFixed(3), ms = Math.round(p.at * 1000);
  return `[s${i}]atrim=${p.a}:${p.b},asetpts=PTS-STARTPTS,afade=t=in:d=0.015,afade=t=out:st=${(d - .015).toFixed(3)}:d=0.015,adelay=${ms}|${ms}[p${i}]`;
});
const graph = `[0:a]aresample=48000,asplit=${placed.length}${placed.map((_, i) => `[s${i}]`).join('')};${parts.join(';')};` +
  `${placed.map((_, i) => `[p${i}]`).join('')}amix=inputs=${placed.length}:normalize=0,apad=whole_dur=${total},atrim=0:${total}[vo]`;
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', 'public/audio/voiceover/Signals-launch-09-27-03-17.m4a', '-filter_complex', graph, '-map', '[vo]', '-c:a', 'pcm_s24le', 'out/vo-placed.wav'], {stdio: 'inherit'});
