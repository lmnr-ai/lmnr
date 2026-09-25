#!/usr/bin/env node
/** Original agent-motion synthesis, audition only. No sample library or paid API.
 * node poc/scripts/generate-agent-whirr-studies.mjs [output-directory]
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {DURATION,SPIN_RPS,TRAVEL_SPEED,SEGMENTS,sampleMotion} from '../public/sound-studies/agent-whirr-v1/motion.mjs';
const SR=48000,N=Math.round(SR*DURATION),TAU=2*Math.PI;
const out=path.resolve(process.argv[2]||'poc/public/sound-studies/agent-whirr-v1');fs.mkdirSync(out,{recursive:true});
function rng(seed){let n=seed>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296*2-1;};}
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
function band(hz,q=.8){const w=TAU*hz/SR,a=Math.sin(w)/(2*q),a0=1+a,a1=-2*Math.cos(w)/a0,a2=(1-a)/a0,b0=a/a0;let x1=0,x2=0,y1=0,y2=0;return x=>{const y=b0*x-b0*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;return y;};}
function highpass(signal,f){const c=Math.exp(-TAU*f/SR);let x1=0,y1=0;return signal.map(x=>{const y=c*(y1+x-x1);x1=x;y1=y;return y;});}
const variants=[
 {id:'01-silk-ratchet',name:'Silk Ratchet',description:'A rounded, close-grained mechanical flutter. More material than pitch.',seed:913,teeth:10,pulseDepth:.8,pulseShape:3.5,material:1.0,body:.7,tone:.025,air:.13,zip:0,root:146.832,width:.09},
 {id:'02-induction',name:'Induction',description:'A finer continuous electronic whirr, with less contact and a brighter moving edge.',seed:271,teeth:18,pulseDepth:.32,pulseShape:1.8,material:.26,body:.34,tone:.21,air:.28,zip:.14,root:155.563,width:.15},
 {id:'03-clockwork-current',name:'Clockwork Current',description:'A soft mechanical core threaded with a restrained electronic sheen.',seed:617,teeth:8,pulseDepth:.6,pulseShape:2.5,material:.64,body:.65,tone:.095,air:.2,zip:.062,root:146.832,width:.11},
];
function render(v){
 const random=rng(v.seed),low=band(240,1.1),core=band(490,1.3),grain=band(1220,1.15),edge=band(2700,.9),contact1=band(380,2.6),contact2=band(810,2.1);
 const airBand=band(1600,.65),sideBand=band(2500,.8),signal=[new Float64Array(N),new Float64Array(N)];
 let carrierPhase=0,airLP=0,lastSpeed=0;
 for(let i=0;i<N;i++){
  const t=i/SR,m=sampleMotion(t),turn=m.angle/360,theta=TAU*turn,teeth=theta*v.teeth;
  const white=random(),whiteSide=random();
  const activation=smooth(m.speed/.19),load=Math.min(1.32,m.speed),movement=Math.pow(load,.72);
  // Continuous rounded tooth pressure; no repeated short click sample or hard trigger edge.
  const contact=Math.pow(.5+.5*Math.cos(teeth),v.pulseShape);
  const eccentric=.91+.06*Math.sin(theta)+.03*Math.sin(theta*2+.6);
  const pressure=(1-v.pulseDepth)+v.pulseDepth*contact;
  const breath=.96+.04*Math.sin(theta*.43+.7);
  const lowNoise=low(white),midNoise=core(white),grainNoise=grain(white),edgeNoise=edge(white);
  const excitation=white*(.035+.965*contact)*activation;
  const material=(.56*midNoise+.25*grainNoise+.07*edgeNoise)*pressure*eccentric;
  const resonant=.66*contact1(excitation)+.24*contact2(excitation);
  // A broad, phase-modulated filament, not an exposed beep or a separately scored note.
  carrierPhase+=TAU*v.root*(.955+.045*load)/SR;
  const rotaryFM=.47*Math.sin(teeth)+.24*Math.sin(theta*3);
  const filament=(Math.sin(3*carrierPhase+rotaryFM)+.23*Math.sin(5*carrierPhase+.7*Math.sin(teeth)))*(.81+.19*Math.cos(teeth+.3));
  // Two shallow spectral glints per revolution remain part of the same mechanism.
  const glint=Math.pow(.5+.5*Math.sin(theta*2-.9),7);
  const sheen=Math.sin(6*carrierPhase+1.2*Math.sin(teeth*.5))*(.08+.92*glint);
  const travelAir=airBand(white),airCutoff=850+load*1800,coefficient=1-Math.exp(-TAU*airCutoff/SR);
  airLP+=coefficient*(travelAir-airLP);
  const acceleration=Math.max(0,(m.speed-lastSpeed)*SR);lastSpeed=m.speed;
  const flow=airLP*Math.pow(load,1.25)*(1+.08*Math.min(acceleration,2));
  const body=(lowNoise*.6+resonant*.4)*(1-.16*contact);
  const mono=(v.material*(material+.65*resonant)+v.body*body+v.tone*filament*.35+v.zip*sheen*.24+v.air*flow)*activation*breath*(.48+.52*Math.min(1,movement));
  // Translation supplies restrained screen pan. Rotation is mainly timbral, not dizzying stereo spin.
  const pan=(m.progress-.5)*.46,angle=(pan+1)*Math.PI/4;
  const side=sideBand(whiteSide)*v.width*activation*load*.18;
  signal[0][i]=(mono+side)*Math.cos(angle);signal[1][i]=(mono-side)*Math.sin(angle);
 }
 // Very short same-polarity reflections preserve the close, small scale of the agent.
 const delays=[[.019,.064],[.037,.041],[.071,.025],[.119,.013]];
 const output=signal.map((ch,c)=>highpass(ch.map((x,i)=>{
  let y=x;for(const [d,g] of delays){const offset=Math.round((d+c*.003)*SR);if(i>=offset)y+=signal[c][i-offset]*g;}
  return y*smooth((DURATION-i/SR)/.12);
 }),65));
 return output;
}
function floatWav(channels){const b=Buffer.alloc(44+N*8);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(3,20);b.writeUInt16LE(2,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*8,28);b.writeUInt16LE(8,32);b.writeUInt16LE(32,34);b.write('data',36);b.writeUInt32LE(N*8,40);for(let i=0;i<N;i++)for(let c=0;c<2;c++){const x=channels[c][i];if(!Number.isFinite(x))throw new Error('Nonfinite PCM');b.writeFloatLE(x,44+i*8+c*4);}return b;}
function ffmpeg(args){const r=spawnSync('ffmpeg',['-hide_banner','-nostdin',...args],{encoding:'utf8',maxBuffer:2*1024*1024});if(r.status!==0)throw new Error(r.stderr);return r;}
function meter(file){const r=ffmpeg(['-i',file,'-af','loudnorm=I=-23:TP=-3:LRA=11:print_format=json','-f','null','-']);const match=r.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);if(!match)throw new Error('Missing meter');const x=JSON.parse(match[0]);return {integratedLUFS:Number(x.input_i),truePeakDbTP:Number(x.input_tp),loudnessRangeLU:Number(x.input_lra)};}
const rendered=[];
for(const v of variants){
 const channels=render(v),temp=path.join(out,`.${v.id}.float.wav`);fs.writeFileSync(temp,floatWav(channels));
 let energy=0,mono=0;for(let i=0;i<N;i++){const l=channels[0][i],r=channels[1][i];energy+=(l*l+r*r)/2;mono+=((l+r)/2)**2;}
 rendered.push({...v,temp,before:meter(temp),monoEnergyRatio:mono/energy});
}
const target=Math.min(-23,...rendered.map(v=>v.before.integratedLUFS-3-v.before.truePeakDbTP));
for(const v of rendered){
 const gain=target-v.before.integratedLUFS,wav=path.join(out,`${v.id}.wav`);
 ffmpeg(['-loglevel','error','-y','-i',v.temp,'-af',`volume=${gain}dB,aresample=dither_method=triangular`,'-c:a','pcm_s16le',wav]);
 ffmpeg(['-loglevel','error','-y','-i',wav,'-c:a','libmp3lame','-b:a','256k',path.join(out,`${v.id}.mp3`)]);
 v.measurements=meter(wav);v.mp3Measurements=meter(path.join(out,`${v.id}.mp3`));v.gainDb=gain;
 if(v.measurements.truePeakDbTP>-2.9||v.mp3Measurements.truePeakDbTP>-2)throw new Error(`Peak violation: ${v.id}`);
 if(Math.abs(v.measurements.integratedLUFS-target)>.25)throw new Error(`Level mismatch: ${v.id}`);
 v.sha256=createHash('sha256').update(fs.readFileSync(wav)).digest('hex');fs.unlinkSync(v.temp);delete v.temp;
 console.log(`${v.name}: ${v.measurements.integratedLUFS} LUFS, ${v.measurements.truePeakDbTP} dBTP`);
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({title:'Agent in motion — whirr auditions',duration:DURATION,sampleRate:SR,provenance:'All audio is original oscillator/noise synthesis. No ratchet recording, piano sample, library effect, or model audio used.',status:'Unapproved motion-sound auditions. Not production integration or a certified seamless loop.',motion:{spinRps:SPIN_RPS,travelSpeed:TRAVEL_SPEED,segments:SEGMENTS,model:'motion.mjs shared by renderer and browser. Integrated cubic speed envelope, not time multiplied by changing speed.'},mastering:{targetLUFS:target,method:'Constant gain only. Three isolated effects matched together; not to music. No limiting/compression.'},variants:rendered},null,2)+'\n');
const motionSource=fs.readFileSync(new URL('../public/sound-studies/agent-whirr-v1/motion.mjs',import.meta.url),'utf8');
fs.writeFileSync(path.join(out,'motion-browser.js'),'// Generated from motion.mjs; do not hand-edit.\n(()=>{\n'+motionSource.replace(/export /g,'')+'\nglobalThis.AgentWhirrMotion={DURATION,SPIN_RPS,TRAVEL_SPEED,SEGMENTS,sampleMotion};\n})();\n');
console.log(`Saved whirr auditions at ${out}`);
