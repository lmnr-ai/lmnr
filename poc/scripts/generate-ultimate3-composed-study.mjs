#!/usr/bin/env node
/** THROWAWAY AUDIO COMPOSITION STUDY — not the production soundtrack.
 * Original synthesis; no third-party audio. Run from repo root with ffmpeg on PATH.
 * node poc/scripts/generate-ultimate3-composed-study.mjs [output-directory]
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const SR=48000, DURATION=29.6, N=Math.round(SR*DURATION), TAU=2*Math.PI;
const out=path.resolve(process.argv[2]||'poc/public/sound-studies/ultimate-3-v2');
fs.mkdirSync(out,{recursive:true});
const db=x=>10**(x/20), samples=s=>new Float64Array(Math.round(s*SR));
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const midi=n=>440*2**((n-69)/12);
function rng(seed){let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296*2-1;};}
function filter(input,type,hz,q=.707){
 const w=TAU*hz/SR,c=Math.cos(w),a=Math.sin(w)/(2*q),a0=1+a,a1=-2*c/a0,a2=(1-a)/a0;
 const b0=(type==='low'?(1-c)/2:(1+c)/2)/a0,b1=(type==='low'?1-c:-(1+c))/a0,b2=b0;
 let x1=0,x2=0,y1=0,y2=0;
 return input.map(x=>{const y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;return y;});
}
function unit(x){let peak=0;for(const v of x)peak=Math.max(peak,Math.abs(v));return x.map(v=>v/Math.max(peak,1e-12));}
function noise(d,seed,lo,hi){const random=rng(seed);return filter(filter(samples(d).map(()=>random()),'low',hi),'high',lo);}
const env=(t,d,a,r)=>smooth(t/a)*Math.exp(-t/r)*smooth((d-t)/.08);

// A muted, noise-excited string rather than a sinusoidal notification tone.
function pluck(note,seed=1,softness=.5,length=1.65){
 const f=midi(note),period=SR/f,size=Math.ceil(period)+2;
 const source=noise(.1,seed,85,1800+softness*1400);
 const ring=new Float64Array(size);
 for(let i=0;i<size;i++)ring[i]=source[i%source.length];
 let position=0,previous=0;
 const delay=period-.5,whole=Math.floor(delay),frac=delay-whole;
 const raw=samples(length);
 for(let i=0;i<raw.length;i++){
  const a=(position-whole+size)%size,b=(a-1+size)%size;
  const delayed=ring[a]*(1-frac)+ring[b]*frac;
  const value=(delayed*.54+previous*.46)*.991;
  previous=delayed;ring[position]=value;position=(position+1)%size;
  const t=i/SR;
  // Quiet material modes give the note a non-electronic attack/body.
  const body=(Math.sin(TAU*f*t)+.16*Math.sin(TAU*f*2.013*t)+.07*Math.sin(TAU*f*3.91*t))*env(t,length,.004,.13);
  raw[i]=value*smooth(t/.003)*Math.exp(-t/.7)*smooth((length-t)/.12)+.055*body;
 }
 return unit(filter(raw,'low',2700));
}
function contact(note,seed,weight=1){
 const f=midi(note),d=.45,n=noise(d,seed,150,2300);
 return unit(n.map((v,i)=>{
  const t=i/SR;
  const modes=Math.sin(TAU*f*t)*env(t,d,.005,.055*weight)+.32*Math.sin(TAU*f*1.48*t)*env(t,d,.004,.032)+.13*Math.sin(TAU*f*2.34*t)*env(t,d,.003,.017);
  return .8*modes+.7*v*env(t,d,.0025,.016);
 }));
}
function warmth(notes,duration,seed=3,opening=.35){
 const random=rng(seed),offsets=notes.map(()=>random()*Math.PI),raw=samples(duration);
 for(let v=0;v<notes.length;v++){
  const frequency=midi(notes[v]);
  for(let h=1;h<=7;h++){
   const amp=(h%2===0?.52:1)/h**1.65/(1+(frequency*h/1050)**2);
   for(let i=0;i<raw.length;i++){
    const t=i/SR;
    const phase=TAU*frequency*h*t+offsets[v]+.012*h*Math.sin(TAU*.17*t+v);
    raw[i]+=amp*Math.sin(phase)*(1+.035*Math.sin(TAU*.23*t+v));
   }
  }
 }
 return unit(raw.map((v,i)=>{
  const t=i/SR,p=t/duration;
  return v*smooth(t/opening)*smooth((duration-t)/1.25)*(.85+.15*Math.sin(Math.PI*p));
 }));
}
function bass(note,duration=1.1){
 const f=midi(note);
 return unit(samples(duration).map((_,i)=>{
  const t=i/SR;
  return (Math.sin(TAU*f*t)+.32*Math.sin(TAU*f*2*t)+.12*Math.sin(TAU*f*3*t))*env(t,duration,.022,.29);
 }));
}
function ribbon(duration,seed,direction=1){
 const low=noise(duration,seed,180,1050),mid=noise(duration,seed+21,800,2800),high=noise(duration,seed+49,2400,4900);
 return unit(low.map((v,i)=>{
  const t=i/SR,p=i/(low.length-1),s=direction>0?p:1-p;
  const folds=(.82+.12*Math.sin(TAU*(5.4*t+.24*t*t))+.06*Math.sin(TAU*19.7*t));
  const shape=Math.sin(Math.PI*p)**1.6*smooth(t/.07)*smooth((duration-t)/.13);
  return (v*(.85-.5*s)+mid[i]*(.12+.48*s)+high[i]*.07*Math.sin(Math.PI*p))*shape*folds;
 }));
}
function grainCloud(duration,seed){
 const random=rng(seed),raw=samples(duration);
 // A rubbing bed made from overlapping soft grains, not a looped white-noise burst.
 for(let at=0;at<duration-.07;at+=.031+(.5+.5*random())*.035){
  const length=.085+(.5+.5*random())*.095;
  const grain=noise(length,seed+Math.round(at*10000),260,1250+(.5+.5*random())*1100);
  const offset=Math.round(at*SR);
  for(let i=0;i<grain.length&&i+offset<raw.length;i++)raw[i+offset]+=grain[i]*Math.sin(Math.PI*i/(grain.length-1))**2;
 }
 return unit(raw.map((v,i)=>v*Math.sin(Math.PI*i/(raw.length-1))**1.2));
}
// Four damped combs and two all-passes form a shared dark acoustic space.
// No pre-existing room impulse or copied audio is used.
function diffuse(input,channel){
 const delays=channel===0?[1499,1601,1867,2053]:[1559,1669,1789,2131];
 const sum=new Float64Array(N);
 for(const size of delays){
  const buffer=new Float64Array(size),feedback=10**(-3*(size/SR)/.82);let p=0,lp=0;
  for(let i=0;i<N;i++){
   const delayed=buffer[p];lp=.48*lp+.52*delayed;buffer[p]=input[i]+lp*feedback;
   sum[i]+=delayed*.25;p=(p+1)%size;
  }
 }
 let output=sum;
 for(const size of channel===0?[223,569]:[263,631]){
  const buffer=new Float64Array(size),next=new Float64Array(N);let p=0;
  for(let i=0;i<N;i++){const delayed=buffer[p];next[i]=delayed-.5*output[i];buffer[p]=output[i]+.5*next[i];p=(p+1)%size;}
  output=next;
 }
 return filter(filter(output,'low',3200),'high',160);
}
const music={dry:[new Float64Array(N),new Float64Array(N)],send:new Float64Array(N)};
const material={dry:[new Float64Array(N),new Float64Array(N)],send:new Float64Array(N)};
const events=[];
function put(bus,at,signal,gain,pan,label,wet=.12){
 const offset=Math.round(at*SR),g=[Math.cos((pan+1)*Math.PI/4),Math.sin((pan+1)*Math.PI/4)];
 if(offset<0||offset+signal.length>N)throw new Error(`Out of bounds: ${label}`);
 for(let i=0;i<signal.length;i++){
  for(let c=0;c<2;c++)bus.dry[c][offset+i]+=signal[i]*gain*g[c];
  bus.send[offset+i]+=signal[i]*gain*wet;
 }
 events.push({at,duration:signal.length/SR,label,stem:bus===music?'musical foundation':'material motion',gain,pan});
}
const note=(at,n,gain=.09,pan=0,seed=1)=>put(music,at,pluck(n,seed),gain,pan,`muted string ${n}`,.18);
const touch=(at,n,gain=.065,pan=0,seed=4)=>put(material,at,contact(n,seed),gain,pan,'material contact',.055);
const move=(at,d,gain=.045,seed=5,dir=1)=>put(material,at,ribbon(d,seed,dir),gain,0,'continuous ribbon',.07);
const pulse=(at,n,gain=.065)=>put(music,at,bass(n),gain,0,'rounded low pulse',.02);
const chord=(at,notes,d,gain,seed=11)=>put(music,at,warmth(notes,d,seed),gain,0,'harmonic field',.19);

// Form: an incomplete idea becomes legible; its returning motif finally gets a home.
// Musical grid is an authored 100 BPM, not an estimate of the reference's tempo.
chord(.05,[50,57,64],5.2,.046); // open fifth/ninth, no major third yet
chord(4.5,[47,54,57,62],5.5,.048,12);
chord(9.3,[43,50,57,59],3.1,.05,13);
chord(11.7,[45,52,57,62],4.25,.054,14);
chord(16.78,[50,54,57,61,64],5.4,.079,15); // opening D motif receives its major-third context
chord(21.3,[43,50,59,62],4.25,.061,16);
chord(24.8,[50,54,57,59,61,64],4.65,.052,17);

// The seed phrase: two related thoughts, not isolated test tones.
note(.65,50,.12,-.08,101); note(1.1,57,.075,.07,102);note(1.7,64,.052,.12,103);
note(3.05,57,.072,-.08,104);note(3.8,62,.07,.07,105);
move(.18,1.0,.027,10);touch(.66,45,.06,0,20);
put(material,1.9,grainCloud(2.35,30),.012,0,'fine connective friction',.025);

// An uneven mechanism finds its cadence. Short sub-phrases leave actual space.
for(const [at,n,g,pan] of [[4.85,47,.10,-.10],[5.3,54,.073,.1],[5.9,62,.055,.15],[7.25,57,.068,-.08],[7.7,54,.05,.1],[8.45,62,.072,0]])note(at,n,g,pan,Math.round(at*100));
move(4.12,.85,.039,41);touch(4.85,45,.07,0,42);
for(const [at,g] of [[5.6,.026],[6.5,.035],[7.4,.026],[8.0,.042],[8.6,.022]])touch(at,52,g,(at%1-.5)*.32,Math.round(at*100));
pulse(4.8,35,.062);pulse(7.2,35,.047);

// Tension is greater density and changing color, not simply a louder master.
move(9.0,1.25,.039,51);pulse(9.6,31,.06);pulse(12,33,.058);
for(const [at,n,g] of [[9.65,50,.073],[10.1,57,.055],[10.55,59,.047],[11.3,62,.069],[12.05,52,.078],[12.5,57,.057],[12.95,62,.048],[13.4,64,.06]])note(at,n,g,Math.sin(at)*.16,Math.round(at*100));
put(material,10.3,grainCloud(3.55,77),.019,0,'gathering friction',.035);
for(let j=0;j<11;j++){
 const at=10.45+j*.265;
 touch(at,57-j*.43,.018+j*.0012,(j%2?1:-1)*.23*(1-j/11),301+j);
}
move(13.2,1.6,.049,91,-1);touch(14.36,43,.047,0,99);

// Breath: drain competing layers and let the listener anticipate the answer.
// No new notes from 13.4 to 16.8; bus envelopes below clear the tails deliberately.
move(16.22,.7,.025,118);

// Opening: same fingerprint, wider voicing, stronger harmonic answer.
pulse(16.8,38,.12);touch(16.8,45,.085,0,120);
note(16.82,50,.125,-.12,121);note(17.27,57,.086,.12,122);note(17.87,64,.058,.2,123);
note(18.62,61,.08,-.15,124);note(19.22,57,.069,.04,125);
for(const [at,n,g] of [[18,38,.055],[19.2,38,.062],[20.4,38,.045],[21.6,31,.06],[22.8,31,.044],[24,38,.045]])pulse(at,n,g);
for(const [at,g,p] of [[17.55,.025,-.08],[18.45,.032,.1],[19.65,.025,-.06],[20.25,.036,.08],[21.15,.019,0],[22.35,.027,.05],[23.25,.018,-.05]])touch(at,52,g,p,Math.round(at*100));
move(19.7,.95,.026,151,-1);
note(20.12,64,.051,.12,126);note(20.72,66,.055,-.09,127);
note(21.62,62,.085,0,128);note(22.07,59,.059,-.12,129);note(22.67,57,.049,.12,130);
put(material,21.95,grainCloud(1.55,161),.011,0,'settling friction',.025);

// Resolution: the opening gesture comes down to rest, not a new logo jingle.
move(23.65,1.0,.022,171,-1);
note(24.17,64,.05,.08,172);note(24.77,61,.054,-.08,173);
note(25.37,62,.085,0,174);touch(25.37,43,.042,0,175);pulse(25.37,38,.068);

function finish(bus){
 const verb=[diffuse(bus.send,0),diffuse(bus.send,1)];
 return bus.dry.map((ch,c)=>filter(ch.map((v,i)=>{
  const t=i/SR;
  const breath=t<14.8?1:t<15.85?1-smooth((t-14.8)/1.05):t<16.12?0:smooth((t-16.12)/.28);
  return (v+verb[c][i])*breath*smooth(t/.03)*smooth((DURATION-t)/.65);
 }),'high',28));
}
let foundation=finish(music),motion=finish(material);
let mix=[0,1].map(c=>foundation[c].map((v,i)=>v+motion[c][i]));
function wav(channels){
 const b=Buffer.alloc(44+N*4),random=rng(20260724);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(N*4,40);
 for(let i=0;i<N;i++)for(let c=0;c<2;c++){
  const v=channels[c][i];if(!Number.isFinite(v)||Math.abs(v)>=1)throw new Error('Clipped/non-finite PCM');
  const d=Math.abs(v)<1e-12?0:(random()-random())*.5;b.writeInt16LE(Math.round(v*32767+d),44+i*4+c*2);
 }
 return b;
}
function measure(file){
 const p=spawnSync('ffmpeg',['-hide_banner','-nostdin','-i',file,'-af','loudnorm=I=-20:TP=-2:LRA=11:print_format=json','-f','null','-'],{encoding:'utf8'});
 if(p.status!==0)throw new Error(p.stderr);const result=p.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);if(!result)throw new Error('No measurements');return JSON.parse(result[0]);
}
const main=path.join(out,'a-thought-finds-its-shape.wav');
fs.writeFileSync(main,wav(mix));const before=measure(main);
const gainDb=Math.min(-20-Number(before.input_i),-2.3-Number(before.input_tp));
for(const channels of [foundation,motion,mix])for(const ch of channels)for(let i=0;i<N;i++)ch[i]*=db(gainDb);
fs.writeFileSync(main,wav(mix));fs.writeFileSync(path.join(out,'musical-foundation.wav'),wav(foundation));fs.writeFileSync(path.join(out,'material-motion.wav'),wav(motion));
const measurements=measure(main);
if(Number(measurements.input_tp)>-2)throw new Error('True peak ceiling exceeded');
const mp3=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-i',main,'-codec:a','libmp3lame','-b:a','256k',path.join(out,'a-thought-finds-its-shape.mp3')],{encoding:'utf8'});
if(mp3.status!==0)throw new Error(mp3.stderr);
const encodedMeasurements=measure(path.join(out,'a-thought-finds-its-shape.mp3'));
if(Number(encodedMeasurements.input_tp)>-1)throw new Error('Encoded true peak ceiling exceeded');
let energy=0,monoEnergy=0,dc=0;
for(let i=0;i<N;i++){const l=mix[0][i],r=mix[1][i];energy+=(l*l+r*r)/2;monoEnergy+=((l+r)/2)**2;dc+=l+r;}
const manifest={title:'A thought finds its shape',version:2,duration:DURATION,sampleRate:SR,bpm:100,provenance:'Entirely original local synthesis; no reference audio, stock sounds, external IRs or generated-model audio.',status:'Unapproved composition study, not scored to final picture.',sections:[{at:0,title:'A thought',description:'An incomplete motif and close material contact.'},{at:4.8,title:'Finding a pattern',description:'Irregular detail finds a shared cadence.'},{at:9.6,title:'Gathering',description:'Density and harmonic suspension create momentum.'},{at:14.4,title:'The breath',description:'The arrangement drains away before the answer.'},{at:16.8,title:'Opening',description:'The motif returns with a wider major voicing.'},{at:24,title:'Coming to rest',description:'A related descending phrase resolves into a short tail.'}],mastering:{method:'Constant gain only; no limiter/compressor. Stems share the full-mix gain and are not individually normalized.',gainDb,wav:measurements,mp3:encodedMeasurements,monoEnergyRatio:monoEnergy/energy,dcMean:dc/(N*2)},events:events.sort((a,b)=>a.at-b.at),sha256:createHash('sha256').update(fs.readFileSync(main)).digest('hex')};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output:out,duration:DURATION,mastering:manifest.mastering,sha256:manifest.sha256},null,2));
