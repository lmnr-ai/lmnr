import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ULTIMATE_3_DEFAULTS} from '../micro-18/settings';
import {verifyPianoAssets} from './assets';
import {buildSilkPlan,renderSilkPCM,renderSilkPCMAsync,mixSilkPCM} from './render';
import {SILK_BUSES,DEFAULT_SILK_MIX,SAMPLE_RATE,type StereoPCM} from './types';
import {encodeSilkWav,pcmPeak,stereo,terminalFade} from './dsp';
import {renderRotor} from './voices';
const assets=()=>verifyPianoAssets(async name=>{const b=await fs.readFile(new URL(`../../../public/ultimate-3-silk/piano/${name}`,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;});
const hash=(pcm:StereoPCM)=>createHash('sha256').update(encodeSilkWav(pcm)).digest('hex');
const silent=(pcm:StereoPCM,start:number,end:number)=>{for(const ch of pcm)for(let i=Math.ceil(start*SAMPLE_RATE);i<Math.floor(end*SAMPLE_RATE);i++)assert.equal(ch[i],0,`unexpected tail at ${i/SAMPLE_RATE}`);};
test('default full-film synchronous and asynchronous PCM byte parity, finite/headroom and music isolation',async()=>{
  const plan=buildSilkPlan(ULTIMATE_3_DEFAULTS),piano=await assets(),stems=renderSilkPCM(plan,piano),asyncStems=await renderSilkPCMAsync(plan,piano);
  for(const bus of SILK_BUSES){assert.equal(stems[bus][0].length,2593600);assert.equal(hash(stems[bus]),hash(asyncStems[bus]));assert.ok(pcmPeak(stems[bus])<.5);silent(stems[bus],plan.semanticDuration,plan.frameDuration);}
  const sfx=mixSilkPCM(stems),enabled=mixSilkPCM(stems,{music:1});assert.ok(pcmPeak(sfx)<.5);assert.ok(pcmPeak(enabled)<.5);assert.notEqual(hash(sfx),hash(enabled));
  assert.equal(hash(mixSilkPCM({...stems,music:stereo(2593600)},DEFAULT_SILK_MIX)),hash(sfx));
  silent(sfx,plan.chapterStarts.conclusion,plan.music.logoAt);
  const offset=plan.chapterStarts.cost;silent(stems.agent,offset+6.33,offset+6.4);silent(stems.agent,offset+13.67,plan.chapterStarts.flow);
  assert.equal(pcmPeak(mixSilkPCM(stems,{master:0})),0);
  const aborted=new AbortController();aborted.abort();await assert.rejects(renderSilkPCMAsync(plan,piano,aborted.signal),{name:'AbortError'});
});
test('piano hash validation refuses altered source bytes',async()=>{await assert.rejects(verifyPianoAssets(async()=>new ArrayBuffer(16)),/integrity mismatch/);});
test('zero cover period, zero motion and very fast actual phase stay finite with bounded brightness',()=>{
  const out=stereo(48000);
  renderRotor({id:'fast',bus:'agent',points:[{time:0,turns:0,distance:0,gain:1,pan:0,brightness:1},{time:.5,turns:500000,distance:0,gain:1,pan:0,brightness:1},{time:1,turns:500000,distance:0,gain:1,pan:0,brightness:1}]},out);
  assert.ok(pcmPeak(out)<.5);silent(out,.5,1);
  const zero=stereo(48000);renderRotor({id:'zero',bus:'agent',points:[{time:0,turns:0,distance:0,gain:1,pan:0,brightness:1},{time:1,turns:0,distance:0,gain:1,pan:0,brightness:1}]},zero);assert.equal(pcmPeak(zero),0);
});
test('coalesced chapter-offset boundaries and instantaneous position steps do not poison carrier phase',()=>{
  const out=stereo(4800),p={time:0,turns:0,distance:0,gain:1,pan:0,brightness:1};
  renderRotor({id:'coalesced',bus:'agent',points:[p,{...p,time:.05,turns:.1},{...p,time:.05,turns:.1,distance:100000},{...p,time:.1,turns:.2,distance:100000}]},out);
  assert.ok(pcmPeak(out)>0);assert.ok(pcmPeak(out)<.5);
});
test('short-film-safe 80ms terminal fade and canonical WAV gain/length checks',()=>{
  const pcm=stereo(480);pcm.forEach(c=>c.fill(.5));terminalFade(pcm,.005);assert.equal(pcm[0][240],0);assert.ok(pcm[0][120]<.5);assert.equal(encodeSilkWav(pcm).length,44+480*8);
  const clip=stereo(1);clip[0][0]=1;assert.throws(()=>encodeSilkWav(clip),/clips/);assert.throws(()=>encodeSilkWav([new Float32Array(1),new Float32Array(2)]),/Unequal/);
});
