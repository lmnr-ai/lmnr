#!/usr/bin/env node
/** Silk Ratchet revision: continuous harmonic rotor + sparse piano/glass ornaments.
 * Run from repo root: node poc/scripts/generate-agent-whirr-polish.mjs [output-directory]
 * The first audition and production soundtrack are read-only inputs, never modified.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {DURATION,SPIN_RPS,TRAVEL_SPEED,SEGMENTS,sampleMotion} from '../public/sound-studies/agent-whirr-v1/motion.mjs';
const SR=48000,N=Math.round(DURATION*SR),TAU=2*Math.PI;
const out=path.resolve(process.argv[2]||'poc/public/sound-studies/agent-whirr-v2');
const previous=path.resolve('poc/public/sound-studies/agent-whirr-v1');
const sourceDir=path.resolve('poc/sound-sources/salamander-tonejs');
const sourceManifest=JSON.parse(fs.readFileSync(path.join(sourceDir,'source-manifest.json'),'utf8'));
fs.mkdirSync(out,{recursive:true});
const stereo=()=>[new Float64Array(N),new Float64Array(N)];
const hash=b=>createHash('sha256').update(b).digest('hex');
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const hz=n=>440*2**((n-69)/12);
function run(args){const result=spawnSync('ffmpeg',['-hide_banner','-nostdin',...args],{maxBuffer:32*1024*1024});if(result.status!==0)throw new Error(result.stderr.toString());return result;}
function filter(input,type,f){const w=TAU*f/SR,c=Math.cos(w),a=Math.sin(w)/Math.SQRT2,a0=1+a,a1=-2*c/a0,a2=(1-a)/a0,b0=(type==='low'?(1-c)/2:(1+c)/2)/a0,b1=(type==='low'?1-c:-(1+c))/a0;let x1=0,x2=0,y1=0,y2=0;return input.map(x=>{const y=b0*x+b1*x1+b0*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;return y;});}
function reflections(input,taps){const output=stereo();for(let c=0;c<2;c++)for(let i=0;i<N;i++){let value=input[c][i];for(const [seconds,gain,cross] of taps){const index=i-Math.round((seconds+c*.003)*SR);if(index>=0)value+=input[cross?1-c:c][index]*gain;}output[c][i]=value*smooth((DURATION-i/SR)/.12);}return output;}
function rotor(){
 const raw=stereo(),root=hz(38); // D2; the audible body is in its low/mid harmonics.
 const partials=[[2,.12],[3,.16],[4,.12],[6,.062],[8,.025],[10,.013],[12,.005]];
 for(let i=0;i<N;i++){
  const t=i/SR,m=sampleMotion(t),theta=m.angle*Math.PI/180;
  const cycles=root*(.983*t+.017*m.distance/TRAVEL_SPEED);
  // Old contact pressure varied almost to silence. Here it is a shallow continuous ripple.
  const pressure=.91+.09*Math.cos(theta*10)+.025*Math.cos(theta*20+.4);
  const breath=.95+.05*Math.sin(theta-.4);
  const activity=smooth(m.speed/.22),load=.83+.17*Math.min(m.speed,1.32);
  let middle=0,side=0;
  for(const [harmonic,amplitude] of partials){
   const phase=TAU*cycles*harmonic+harmonic*.81;
   const color=1+.12*Math.cos(theta+(harmonic%3)*TAU/3);
   // Small phase motion, not random-noise excitation or hard retriggered contact grains.
   const bend=.07*Math.sin(theta)+.025*Math.sin(theta*10+.2*harmonic);
   middle+=amplitude*Math.sin(phase+bend)*color;
   side+=amplitude*.065*Math.sin(phase+.24*Math.sin(TAU*.34*t+harmonic));
  }
  const pan=(m.progress-.5)*.46,angle=(pan+1)*Math.PI/4,gain=activity*load*pressure*breath;
  raw[0][i]=(middle+side)*gain*Math.cos(angle);raw[1][i]=(middle-side)*gain*Math.sin(angle);
 }
 const filtered=raw.map(ch=>filter(filter(ch,'high',95),'low',1450));
 return reflections(filtered,[[.027,.035,false],[.061,.024,true],[.107,.012,false]]);
}
const ornaments=[
 {at:.86,note:81,gain:.16,duration:.29,pan:-.25,role:'Launch: first lifted pearl'},
 {at:1.01,note:88,gain:.20,duration:.34,pan:-.03,role:'Launch: open fifth/ninth color'},
 {at:1.19,note:90,gain:.15,duration:.38,pan:.19,role:'Launch: lighter grace-note crown'},
 {at:2.78,note:86,gain:.09,duration:.34,pan:.09,role:'One quiet answering glint; otherwise leave the cruise alone'},
 {at:4.07,note:78,gain:.17,duration:.29,pan:-.18,role:'Acceleration: lower pickup'},
 {at:4.21,note:81,gain:.21,duration:.31,pan:.01,role:'Acceleration: opening upward'},
 {at:4.36,note:88,gain:.25,duration:.42,pan:.23,role:'Acceleration: suspended bright tip'},
];
const usedSources=new Map();
function pianoSource(note){
 const entry=sourceManifest.files.reduce((a,b)=>Math.abs(a.midi-note)<=Math.abs(b.midi-note)?a:b);
 if(Math.abs(note-entry.midi)>1)throw new Error('Unexpected large sample transposition');
 if(!usedSources.has(entry.name)){
  const bytes=fs.readFileSync(path.join(sourceDir,entry.name));if(hash(bytes)!==entry.sha256)throw new Error(`Source hash mismatch: ${entry.name}`);
  const bytesPCM=run(['-loglevel','error','-i',path.join(sourceDir,entry.name),'-ar',String(SR),'-ac','1','-f','f32le','-']).stdout;
  const pcm=new Float32Array(bytesPCM.buffer.slice(bytesPCM.byteOffset,bytesPCM.byteOffset+bytesPCM.byteLength));
  let peak=0;for(const x of pcm)peak=Math.max(peak,Math.abs(x));let onset=0;while(onset<pcm.length&&Math.abs(pcm[onset])<peak*.006)onset++;
  usedSources.set(entry.name,{...entry,pcm,onset});
 }
 return usedSources.get(entry.name);
}
function ornamentVoice(cue){
 const source=pianoSource(cue.note),length=Math.round(cue.duration*SR),raw=new Float64Array(length),rate=2**((cue.note-source.midi)/12);
 // Discard the very first hammer contact, retain the actual string partials, and soften the new edge.
 const start=source.onset+Math.round(.009*SR);
 for(let i=0;i<length;i++){
  const at=start+i*rate,index=Math.floor(at),fraction=at-index;
  if(index+1>=source.pcm.length)break;
  raw[i]=source.pcm[index]*(1-fraction)+source.pcm[index+1]*fraction;
 }
 const upper=filter(filter(raw,'high',1050),'low',5600),body=filter(raw,'low',3200);
 const shaped=raw.map((_,i)=>{
  const t=i/SR,glass=Math.sin(TAU*hz(cue.note)*t+.13*Math.exp(-t/.09)*Math.sin(TAU*hz(cue.note)*2.006*t));
  return (.86*upper[i]+.14*body[i]+.004*glass)*smooth(t/.013)*Math.exp(-t/.19)*smooth((cue.duration-t)/.1);
 });
 let peak=0;for(const x of shaped)peak=Math.max(peak,Math.abs(x));
 return shaped.map(x=>x/Math.max(peak,1e-12));
}
function decoration(){
 const raw=stereo();
 for(const cue of ornaments){
  const voice=ornamentVoice(cue),base=Math.round(cue.at*SR);
  for(let i=0;i<voice.length&&base+i<N;i++){
   const u=i/voice.length,pan=cue.pan+.05*u,angle=(pan+1)*Math.PI/4;
   raw[0][base+i]+=voice[i]*cue.gain*Math.cos(angle);raw[1][base+i]+=voice[i]*cue.gain*Math.sin(angle);
  }
 }
 // The ending unthreads softly within the deceleration. No new impact or success chime at rest.
 const start=6.19,duration=.57,f0=hz(69),f1=hz(66);
 for(let i=0;i<Math.round(duration*SR);i++){
  const t=i/SR,u=t/duration,index=Math.round(start*SR)+i;
  const cycles=f0*t+(f1-f0)*duration*(u**3-.5*u**4);
  const e=smooth(t/.06)*smooth((duration-t)/.24)*Math.exp(-t/.19);
  const x=(Math.sin(TAU*cycles)+.14*Math.sin(TAU*cycles*2))*.025*e;
  raw[0][index]+=x*.66;raw[1][index]+=x*.75;
 }
 return reflections(raw,[[.063,.075,true],[.107,.035,false],[.173,.019,true],[.239,.009,false]]);
}
function floatWav(signal){const b=Buffer.alloc(44+N*8);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(3,20);b.writeUInt16LE(2,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*8,28);b.writeUInt16LE(8,32);b.writeUInt16LE(32,34);b.write('data',36);b.writeUInt32LE(N*8,40);for(let i=0;i<N;i++)for(let c=0;c<2;c++){if(!Number.isFinite(signal[c][i]))throw new Error('Nonfinite PCM');b.writeFloatLE(signal[c][i],44+i*8+c*4);}return b;}
function meter(file){const stderr=run(['-i',file,'-af','loudnorm=I=-23:TP=-3:LRA=11:print_format=json','-f','null','-']).stderr.toString();const match=stderr.match(/\{\s*"input_i"[\s\S]*?\}/);if(!match)throw new Error('No loudness result');const m=JSON.parse(match[0]);return {integratedLUFS:Number(m.input_i),truePeakDbTP:Number(m.input_tp),loudnessRangeLU:Number(m.input_lra)};}
function pcmWav(signal,gain,seed){const b=Buffer.alloc(44+N*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(N*4,40);let state=seed;function random(){state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;}for(let i=0;i<N;i++)for(let c=0;c<2;c++){const x=signal[c][i]*gain;if(!Number.isFinite(x)||Math.abs(x)>=.999)throw new Error('Invalid/clipped PCM');const dither=x===0?0:random()-random();b.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(x*32767+dither))),44+i*4+c*2);}return b;}
const core=rotor(),sparkles=decoration();
const full=core.map((ch,c)=>ch.map((x,i)=>x+sparkles[c][i]));
const extra=core.map((ch,c)=>ch.map((x,i)=>x+sparkles[c][i]*1.65));
const mixes=[{id:'silk-refined',name:'Silk Ratchet — refined',signal:full,sparkleGain:1},{id:'silk-extra-sparkle',name:'Same rotor, more sparkle',signal:extra,sparkleGain:1.65},{id:'silk-core',name:'Smooth rotor only',signal:core,sparkleGain:0},{id:'silk-sparkles',name:'Ornament stem',signal:sparkles,sparkleGain:1}];
for(const mix of mixes){const temp=path.join(out,`.${mix.id}.float.wav`);fs.writeFileSync(temp,floatWav(mix.signal));mix.before=meter(temp);fs.unlinkSync(temp);}
const gainDb=Math.min(-23-mixes[0].before.integratedLUFS,...mixes.map(m=>-3.5-m.before.truePeakDbTP));
const gain=10**(gainDb/20),files=[];
for(let k=0;k<mixes.length;k++){
 const mix=mixes[k],wav=path.join(out,`${mix.id}.wav`);fs.writeFileSync(wav,pcmWav(mix.signal,gain,82713+k*190));
 const measurements=meter(wav);
 run(['-loglevel','error','-y','-i',wav,'-c:a','libmp3lame','-b:a','256k',path.join(out,`${mix.id}.mp3`)]);
 const mp3Measurements=meter(path.join(out,`${mix.id}.mp3`));
 if(measurements.truePeakDbTP>-3.4||mp3Measurements.truePeakDbTP>-2)throw new Error('Peak ceiling failed');
 if(k===0&&Math.abs(measurements.integratedLUFS+23)>.15)throw new Error('Full mix not matched to original');
 let energy=0,mono=0;for(let i=0;i<N;i++){const l=mix.signal[0][i],r=mix.signal[1][i];energy+=(l*l+r*r)/2;mono+=((l+r)/2)**2;}
 files.push({id:mix.id,name:mix.name,sparkleGain:mix.sparkleGain,gainDb,measurements,mp3Measurements,monoEnergyRatio:mono/energy,sha256:hash(fs.readFileSync(wav))});
 console.log(`${mix.id}: ${measurements.integratedLUFS} LUFS, ${measurements.truePeakDbTP} dBTP`);
}
for(const extension of ['wav','mp3'])fs.copyFileSync(path.join(previous,`01-silk-ratchet.${extension}`),path.join(out,`silk-original.${extension}`));
const original=fs.readFileSync(path.join(out,'silk-original.wav'));
const originalManifest=JSON.parse(fs.readFileSync(path.join(previous,'manifest.json'),'utf8'));
if(hash(original)!==originalManifest.variants[0].sha256)throw new Error('Original comparison changed');
files.push({id:'silk-original',name:'Original Silk Ratchet — unchanged',measurements:meter(path.join(out,'silk-original.wav')),sha256:hash(original)});
const motionSource=fs.readFileSync(path.join(previous,'motion.mjs'),'utf8');
fs.writeFileSync(path.join(out,'motion.mjs'),motionSource);
fs.writeFileSync(path.join(out,'motion-browser.js'),'// Generated from motion.mjs; do not hand-edit.\n(()=>{\n'+motionSource.replace(/export /g,'')+'\nglobalThis.AgentWhirrMotion={DURATION,SPIN_RPS,TRAVEL_SPEED,SEGMENTS,sampleMotion};\n})();\n');
fs.copyFileSync(path.join(previous,'spinner.svg'),path.join(out,'spinner.svg'));
const sourceFiles=[...usedSources.values()].map(({pcm,onset,...entry})=>entry);
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({title:'Silk Ratchet — smoother core, restrained sparkle',status:'User-requested refinement; not yet listening-approved or integrated into film.',duration:DURATION,sampleRate:SR,feedback:'Original Silk Ratchet preferred, but too grainy, textured and bland. User wants smoothness, sparkle and flair.',motion:{spinRps:SPIN_RPS,travelSpeed:TRAVEL_SPEED,segments:SEGMENTS,sourceSha256:hash(Buffer.from(motionSource))},changes:{rotor:'No stochastic noise or hard contact grains; continuous low/mid harmonic body, shallow 10-per-revolution pressure ripple, restrained spectral/phase movement.',ornaments:'Seven high-register piano/glass grace notes in two principal flourishes and one quiet cruise answer; soft unwinding in the deceleration, no new hit at the stop.',extra:'Exactly the same rotor and timing; ornaments +4.35 dB. Common gain, not a louder core.'},ornaments,unwind:{at:6.19,duration:.57,fromMidi:69,toMidi:66},mastering:{targetFullMixLUFS:-23,gainDb,method:'One constant gain for all new stems/mixes; no compression or limiting. Refined full mix matched to original. Extra-sparkle option has slightly higher total loudness.'},provenance:{rotor:'Original deterministic harmonic synthesis, no noise source.',piano:{instrument:sourceManifest.instrument,author:sourceManifest.author,license:sourceManifest.license,licenseUrl:sourceManifest.licenseUrl,repository:sourceManifest.repository,commit:sourceManifest.commit,changes:'Local MP3 sources verified by SHA-256, decoded to mono, hammer onset shortened, transposed at most one semitone, filtered toward upper string partials, softly enveloped into short ornaments, mixed with original glass-like phase modulation, panned and given short reflections.',files:sourceFiles},original:'Byte-identical copy of original Silk Ratchet for comparison. No paid model requests or new sample downloads.'},files},null,2)+'\n');
console.log(`Saved revised Silk Ratchet and comparison at ${out}`);
