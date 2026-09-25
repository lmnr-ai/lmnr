#!/usr/bin/env node
/** Original, deterministic synthesis. No source audio, sample libraries, or IRs.
 * Run: node poc/scripts/generate-ultimate3-sound-studies.mjs [output-directory]
 * Requires ffmpeg on PATH. Generation never touches the existing soundtrack.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const SR = 48000, DURATION = 16, N = SR * DURATION;
const out = path.resolve(process.argv[2] || 'poc/public/sound-studies/ultimate-3-v1');
fs.mkdirSync(out, {recursive:true});
const tau = Math.PI * 2;
const db = value => 10 ** (value / 20);
const smooth = x => { x = Math.max(0, Math.min(1,x)); return x*x*(3-2*x); };
const timeline = t => new Float64Array(Math.round(t * SR));
function rng(seed) {
  let s = seed >>> 0;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0)/4294967296*2-1; };
}
function filter(input, type, frequency, q = .707) {
  const w = tau*frequency/SR, c = Math.cos(w), alpha = Math.sin(w)/(2*q);
  const a0 = 1+alpha, a1 = -2*c/a0, a2 = (1-alpha)/a0;
  const b0 = (type==='low' ? (1-c)/2 : (1+c)/2)/a0;
  const b1 = (type==='low' ? 1-c : -(1+c))/a0, b2 = b0;
  let x1=0,x2=0,y1=0,y2=0;
  return input.map(x => {
    const y = b0*x+b1*x1+b2*x2-a1*y1-a2*y2;
    x2=x1;x1=x;y2=y1;y1=y;return y;
  });
}
function noise(duration, seed, lo=220, hi=3800) {
  const random = rng(seed);
  return filter(filter(timeline(duration).map(()=>random()),'low',hi),'high',lo);
}
function envelope(t,duration,attack,decay) {
  return smooth(t/attack)*Math.exp(-t/decay)*smooth((duration-t)/.025);
}
function unit(x) {
  let peak=0; for(const v of x) peak=Math.max(peak,Math.abs(v));
  assert(peak>0); return x.map(v=>v/peak);
}
function contact(frequency, brightness, seed, decay=.065) {
  const duration=.52, n=noise(duration,seed,350,2000+brightness*3500);
  const modes=[[1,1,1],[1.61,.27,.58],[2.31,.13,.35],[3.82,.045,.21]];
  return unit(n.map((v,i)=>{
    const t=i/SR;
    let body=0;
    for(const [ratio,amp,d] of modes) body+=amp*Math.sin(tau*frequency*ratio*t)*envelope(t,duration,.0035,decay*d);
    return .78*body+v*(.35+brightness*.4)*envelope(t,duration,.002,.012);
  }));
}
function clarity(frequency, brightness=.3, decay=.13) {
  const duration=1.05;
  return unit(timeline(duration).map((_,i)=>{
    const t=i/SR, phase=tau*frequency*t;
    const fm=brightness*Math.exp(-t/.025)*Math.sin(phase*2);
    return (Math.sin(phase+fm)+.075*Math.sin(phase*3)*Math.exp(-t/.038))*envelope(t,duration,.007,decay);
  }));
}
function travel(duration,seed,brightness=.3) {
  const low=noise(duration,seed,260,1400);
  const high=noise(duration,seed+91,1400,4600);
  return unit(low.map((v,i)=>{
    const p=i/(low.length-1), t=i/SR;
    const arc=Math.sin(Math.PI*p)**2;
    const grain=1+.1*Math.sin(tau*29*t)*Math.sin(tau*11*t);
    return ((.8-.48*p)*v+(.08+brightness*.45*p)*high[i])*arc*grain;
  }));
}
function room(mono,pan=0,send=.065) {
  const size=mono.length+Math.round(.23*SR), result=[new Float64Array(size),new Float64Array(size)];
  const gains=[Math.cos((pan+1)*Math.PI/4),Math.sin((pan+1)*Math.PI/4)];
  const dark=filter(mono,'low',2400);
  // Quiet, asymmetric same-polarity reflections; direct signal stays mono-compatible.
  for(let c=0;c<2;c++) {
    for(let i=0;i<mono.length;i++)result[c][i]+=mono[i]*gains[c];
    const taps=c===0 ? [[.019,.8],[.043,.45],[.079,.24],[.131,.1]] : [[.027,.78],[.051,.44],[.097,.21],[.163,.08]];
    for(const [delay,gain] of taps) {
      const offset=Math.round(delay*SR);
      for(let i=0;i<dark.length;i++)result[c][i+offset]+=dark[i]*send*gain;
    }
  }
  return result;
}
function wave(channels) {
  const data=Buffer.alloc(N*4), random=rng(9273);
  for(let i=0;i<N;i++)for(let c=0;c<2;c++) {
    const v=channels[c][i];assert(Number.isFinite(v)&&Math.abs(v)<1,'nonfinite/clipping');
    // TPDF dither only where nonzero. Leading/trailing authored silence stays silent.
    const d=v===0?0:(random()-random())*.5;
    data.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(v*32767+d))),i*4+c*2);
  }
  const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+data.length,4);header.write('WAVEfmt ',8);
  header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(SR,24);
  header.writeUInt32LE(SR*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(data.length,40);
  return Buffer.concat([header,data]);
}
function meter(file) {
  const p=spawnSync('ffmpeg',['-hide_banner','-nostdin','-i',file,'-af','loudnorm=I=-22:TP=-3:LRA=11:print_format=json','-f','null','-'],{encoding:'utf8'});
  if(p.status!==0)throw new Error(p.stderr);
  const match=p.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  assert(match,'missing ffmpeg loudness data');return JSON.parse(match[0]);
}
const studies=[
  {id:'01-felt-circuit',title:'Felt Circuit',subtitle:'Warm contact · brushed motion · rounded decisions',seed:401,base:330,bright:.12,decay:.085,air:.18,room:.045,contactGain:.19,toneGain:.085,travelGain:.095,
    intention:'Material-led: gently damped contacts and fine friction. Digital tones remain behind the touch. No sampled felt or paper is used.'},
  {id:'02-glass-thread',title:'Glass Thread',subtitle:'Fine articulation · narrow tones · clean movement',seed:701,base:660,bright:.62,decay:.045,air:.6,room:.09,contactGain:.12,toneGain:.105,travelGain:.07,
    intention:'Precision-led: shorter, lighter contacts and restrained FM articulation. Not a notification sequence; no literal glass recording.'},
  {id:'03-quiet-assembly',title:'Quiet Assembly',subtitle:'Soft body · one bright answer · room to breathe',seed:1103,base:294,bright:.22,decay:.075,air:.27,room:.06,contactGain:.18,toneGain:.077,travelGain:.08,
    intention:'Sparse hybrid: material carries the movement, a single brighter arrival supplies clarity, and the composition leaves longer gaps.'}
];
const manifest={version:1,sampleRate:SR,duration:DURATION,provenance:'100% original seeded synthesis; no reference audio, samples, recorded Foley, music, or impulse responses.',mastering:'Constant gain toward -22 LUFS integrated, constrained by -3 dBTP measured ceiling; no limiter/compressor or dynamic normalization. Sparse arrangements retain different loudness contours.',sections:[{at:0,label:'Individual swatches'},{at:8,label:'Breathing room'},{at:9.2,label:'Composed phrase'},{at:14.5,label:'Tail / silence'}],studies:[]};
for(const s of studies) {
  const mix=[new Float64Array(N),new Float64Array(N)],events=[];
  function add(at,mono,gain,pan,label,send=s.room) {
    const signal=room(mono,pan,send),offset=Math.round(at*SR);
    assert(offset>=0&&offset+signal[0].length<N,'cue exceeds study duration');
    for(let c=0;c<2;c++)for(let i=0;i<signal[c].length;i++)mix[c][offset+i]+=signal[c][i]*gain;
    events.push({at,duration:mono.length/SR,label,gain,pan});
  }
  const touch=(at,pitch=1,gain=1,pan=0,seed=0)=>add(at,contact(s.base*pitch,s.bright,s.seed+seed,s.decay),s.contactGain*gain,pan,'contact');
  const tone=(at,pitch=1,gain=1,pan=0)=>add(at,clarity(880*pitch,s.bright,.13),s.toneGain*gain,pan,'clarity');
  const sweep=(at,duration,gain=1)=>add(at,travel(duration,s.seed+Math.round(at*100),s.air),s.travelGain*gain,0,'travel',s.room*.65);
  const gather=(at,count=5,gain=1)=>{
    for(let j=0;j<count;j++) {
      const p=j/(count-1);
      add(at+j*.115,contact(s.base*(1.7-.45*p),s.bright*.7,s.seed+40+j,.025),s.contactGain*.3*gain*(.65+.35*p),(j%2?1:-1)*.36*(1-p),'gather grain',s.room*.5);
    }
    touch(at+(count-1)*.115+.15,1,.67*gain,0,23);
  };
  // Comparable role order in every study; no continuous music hides the materials.
  touch(.75);tone(2.2,1,.8);sweep(3.55,1.25);gather(6.1,s.id.startsWith('03')?3:5,.8);
  if(s.id.startsWith('01')) {
    sweep(9.2,.92,.8);touch(10.12,1,.85);touch(10.48,1.12,.42,-.12,5);
    gather(11.25,4,.7);tone(12.35,.75,.62);touch(13.12,.84,.5);tone(13.14,1,.58);
  } else if(s.id.startsWith('02')) {
    touch(9.2,1,.75);tone(9.53,1,.62,-.12);tone(9.85,1.5,.33,.12);
    sweep(10.6,.8,.8);gather(11.55,4,.6);tone(13.12,.75,.82);
  } else {
    sweep(9.2,1.12,.8);touch(10.32,1,.8);gather(11.45,3,.48);
    touch(13.12,.89,.55);tone(13.145,1,.75);
  }
  // DC removal uses a gentle high-pass, then explicit boundary fades.
  for(let c=0;c<2;c++) {
    mix[c]=filter(mix[c],'high',35);
    for(let i=0;i<N;i++)mix[c][i]*=smooth((DURATION-i/SR)/.06);
    // Sub-audible filter tails are made exact zero before PCM conversion.
    for(let i=0;i<N;i++)if(Math.abs(mix[c][i])<1e-12)mix[c][i]=0;
  }
  const file=path.join(out,`${s.id}.wav`);
  fs.writeFileSync(file,wave(mix));
  const before=meter(file), gainDb=Math.min(-22-Number(before.input_i),-3.2-Number(before.input_tp));
  assert(Number.isFinite(gainDb));
  for(let c=0;c<2;c++)for(let i=0;i<N;i++)mix[c][i]*=db(gainDb);
  fs.writeFileSync(file,wave(mix));
  const measured=meter(file);
  assert(Number(measured.input_tp)<=-3,'true peak ceiling');
  let sum=0,energy=0,monoEnergy=0,peak=0;
  for(let i=0;i<N;i++) {
    const l=mix[0][i],r=mix[1][i];sum+=l+r;energy+=l*l+r*r;monoEnergy+=((l+r)/2)**2;peak=Math.max(peak,Math.abs(l),Math.abs(r));
  }
  assert(Math.abs(sum/(N*2))<1e-5,'DC offset');assert(monoEnergy/(energy/2)>.8,'mono compatibility');
  assert(mix.every(ch=>ch.subarray(0,SR/2).every(v=>v===0)),'leading silence');
  const item={...s,file:`${s.id}.wav`,events,measurements:{integratedLUFS:Number(measured.input_i),truePeakDbTP:Number(measured.input_tp),loudnessRangeLU:Number(measured.input_lra),gainDb,monoEnergyRatio:monoEnergy/(energy/2),samplePeak:peak},sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
  manifest.studies.push(item);
  console.log(JSON.stringify({id:s.id,...item.measurements,sha256:item.sha256}));
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Wrote ${studies.length} original ${DURATION}s stereo studies to ${out}`);
