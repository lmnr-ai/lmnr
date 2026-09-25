#!/usr/bin/env node
// Run from poc: node scripts/prepare-ultimate3-silk-assets.mjs
// One authoritative decode; both browser and CLI consume these exact float PCM bytes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'sound-sources/salamander-tonejs');
const out=path.join(root,'public/ultimate-3-silk/piano');
const manifest=JSON.parse(fs.readFileSync(path.join(source,'source-manifest.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
fs.mkdirSync(out,{recursive:true});
const files=[];
for(const midi of [78,81,87,90]) {
 const entry=manifest.files.find(x=>x.midi===midi);
 const bytes=fs.readFileSync(path.join(source,entry.name));
 if(sha(bytes)!==entry.sha256)throw new Error(`Source hash mismatch: ${entry.name}`);
 const result=spawnSync('ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-i',path.join(source,entry.name),'-ar','48000','-ac','1','-t','1','-f','f32le','-'],{maxBuffer:8*1024*1024});
 if(result.status!==0)throw new Error(result.stderr.toString());
 const pcm=result.stdout; let peak=0,onset=0;
 for(let i=0;i<pcm.length;i+=4)peak=Math.max(peak,Math.abs(pcm.readFloatLE(i)));
 while(onset<pcm.length/4&&Math.abs(pcm.readFloatLE(onset*4))<peak*.006)onset++;
 const name=`${midi}.f32`;fs.writeFileSync(path.join(out,name),pcm);
 files.push({name,midi,samples:pcm.length/4,onset,sha256:sha(pcm),source:entry});
}
const {files:_,...provenance}=manifest;
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({version:1,sampleRate:48000,format:'mono little-endian float32',provenance,modifications:'Hash-verified local MP3 decoded once with ffmpeg to mono 48k float PCM, retained first second. Renderer removes onset +9ms, transposes <=1 semitone, filters and softly envelopes with glass and reflections.',files},null,2)+'\n');
console.log('Prepared pinned Silk piano PCM: '+files.map(f=>f.sha256).join(' '));
