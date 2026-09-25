import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {sampleMotion} from '../public/sound-studies/agent-whirr-v1/motion.mjs';
const directory=path.resolve(process.argv[2]||'poc/public/sound-studies/agent-whirr-v2');
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
function pcmWave(bytes){
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
 let format,data;
 for(let offset=12;offset+8<=bytes.length;){
  const id=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),value=bytes.subarray(offset+8,offset+8+size);
  if(id==='fmt ')format=value;if(id==='data')data=value;offset+=8+size+(size%2);
 }
 assert.ok(format&&data);assert.equal(format.readUInt16LE(0),1);assert.equal(format.readUInt16LE(2),2);assert.equal(format.readUInt32LE(4),48000);assert.equal(format.readUInt16LE(14),16);
 assert.equal(data.length,Math.round(manifest.duration*48000)*4);
 const output=new Int16Array(data.length/2);for(let i=0;i<output.length;i++)output[i]=data.readInt16LE(i*2);return output;
}
const pcm=new Map();
for(const file of manifest.files){
 const bytes=fs.readFileSync(path.join(directory,file.id+'.wav'));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.id+' hash');
 const samples=pcmWave(bytes);pcm.set(file.id,samples);
 let peak=0;for(const x of samples)peak=Math.max(peak,Math.abs(x));assert.ok(peak<32767,file.id+' headroom');
 assert.ok(file.measurements.truePeakDbTP<=-3);if(file.mp3Measurements)assert.ok(file.mp3Measurements.truePeakDbTP<=-2);
 if(file.id!=='silk-original'){for(let i=0;i<.44*48000*2;i++)assert.equal(samples[i],0,'exact opening silence');}
}
const original=fs.readFileSync('poc/public/sound-studies/agent-whirr-v1/01-silk-ratchet.wav');
assert.deepEqual(fs.readFileSync(path.join(directory,'silk-original.wav')),original,'original unchanged');
assert.ok(Math.abs(manifest.files[0].measurements.integratedLUFS-manifest.files.at(-1).measurements.integratedLUFS)<.15,'refined/original loudness match');
const core=pcm.get('silk-core'),sparkles=pcm.get('silk-sparkles'),full=pcm.get('silk-refined'),extra=pcm.get('silk-extra-sparkle');
let fullError=0,extraError=0;
for(let i=0;i<full.length;i++){fullError=Math.max(fullError,Math.abs(core[i]+sparkles[i]-full[i]));extraError=Math.max(extraError,Math.abs(core[i]+sparkles[i]*1.65-extra[i]));}
assert.ok(fullError<=4,'full stem sum within dither tolerance');assert.ok(extraError<=6,'extra sparkle does not change core gain');
const browser={};vm.runInNewContext(fs.readFileSync(path.join(directory,'motion-browser.js'),'utf8'),browser);
for(const time of [0,.45,.8,1.45,2.8,3.9,4.2,4.5,5.5,6.2,6.85,8.4,40]){
 assert.equal(JSON.stringify(browser.AgentWhirrMotion.sampleMotion(time)),JSON.stringify(sampleMotion(time)),'browser/renderer motion parity');
 if(time>.45&&time<6.85){const velocity=(sampleMotion(time+1e-5).distance-sampleMotion(time-1e-5).distance)/2e-5;assert.ok(Math.abs(velocity-sampleMotion(time).speed*660)<.01);}
}
assert.equal(sampleMotion(6.85).angle,sampleMotion(40).angle);
assert.ok(fs.readFileSync(path.join(directory,'CREDITS.md'),'utf8').includes('Alexander Holm'));
console.log(`PASS: PCM formats/durations, WAV hashes, peaks, silence, unchanged original, level match, stem sums (${fullError}/${extraError.toFixed(2)} PCM units), motion parity and credits.`);
