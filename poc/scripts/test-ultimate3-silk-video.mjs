#!/usr/bin/env node
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {command,verifySilkVideo} from './verify-ultimate3-silk-video.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('proper AAC skip metadata does not excuse a real 2048-sample residual delay',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'silk-negative-delay-')),bad=path.join(tmp,'delayed.mp4');
 const picture=path.join(root,'out/ultimate3-silk/retimed-music-enabled-excerpt.mp4'),wav=path.join(root,'public/ultimate-3-silk/exports/retimed-enabled/current-mix.wav');
 try{
  command('ffmpeg',['-v','error','-nostdin','-y','-i',picture,'-ss','30','-i',wav,'-map','0:v:0','-map','1:a:0','-c:v','copy','-af','adelay=2048S:all=1','-c:a','aac','-b:a','192k','-t','10','-movflags','+faststart',bad]);
  assert.throws(()=>verifySilkVideo(bad,wav,30,300),/Presentation audio mismatch: residual lag 2048/);
 }finally{if(fs.existsSync(bad))fs.unlinkSync(bad);fs.rmdirSync(tmp);}
});
test('valid silent/master-zero presentation is accepted without inventing a measured lag',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'silk-silent-mux-')),video=path.join(tmp,'silent.mp4'),wav=path.join(tmp,'silent.wav');
 try{
  const b=Buffer.alloc(44+480000*8);fs.readFileSync(path.join(root,'public/ultimate-3-silk/default/sfx-only.wav')).copy(b,0,0,44);b.writeUInt32LE(b.length-8,4);b.writeUInt32LE(b.length-44,40);fs.writeFileSync(wav,b);
  command('ffmpeg',['-v','error','-nostdin','-y','-i',path.join(root,'out/ultimate3-silk/retimed-music-enabled-excerpt.mp4'),'-i',wav,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-t','10',video]);
  const result=verifySilkVideo(video,wav,0,300);assert.equal(result.silent,true);assert.equal(result.residualLagSamples,null);assert.equal(result.decodedPeak,0);
 }finally{for(const file of fs.readdirSync(tmp))fs.unlinkSync(path.join(tmp,file));fs.rmdirSync(tmp);}
});
