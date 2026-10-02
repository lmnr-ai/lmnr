#!/usr/bin/env node
/** THREE COMPOSITION SKETCHES, not production cues.
 * Piano: Alexander Holm's Salamander Grand Piano, CC BY 3.0 (see source manifest).
 * Scores and all electronic voices: original. No paid API/model calls.
 * node poc/scripts/prepare-ultimate3-piano-sources.mjs  # first use only
 * node poc/scripts/generate-ultimate3-piano-electronic-studies.mjs [output-directory]
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const SR=48000,TAU=2*Math.PI,out=path.resolve(process.argv[2]||'poc/public/sound-studies/ultimate-3-v3');
const sourceDir=path.resolve('poc/sound-sources/salamander-tonejs');
const sourceManifest=JSON.parse(fs.readFileSync(path.join(sourceDir,'source-manifest.json'),'utf8'));
fs.mkdirSync(out,{recursive:true});
const hz=n=>440*2**((n-69)/12),db=x=>10**(x/20),arr=d=>new Float64Array(Math.round(d*SR));
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
function rng(seed){let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296*2-1;};}
function normalize(signal){let max=0;for(const x of signal)max=Math.max(max,Math.abs(x));return signal.map(x=>x/Math.max(max,1e-12));}
function filter(signal,type,freq){
 const w=TAU*freq/SR,c=Math.cos(w),a=Math.sin(w)/Math.SQRT2,a0=1+a,a1=-2*c/a0,a2=(1-a)/a0;
 const b0=(type==='low'?(1-c)/2:(1+c)/2)/a0,b1=(type==='low'?1-c:-(1+c))/a0,b2=b0;
 let x1=0,x2=0,y1=0,y2=0;
 return signal.map(x=>{const y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;return y;});
}
function run(args){const r=spawnSync('ffmpeg',['-hide_banner','-nostdin',...args],{encoding:null,maxBuffer:32*1024*1024});if(r.status!==0)throw new Error(r.stderr.toString());return r;}
const sources=sourceManifest.files.map(file=>{
 const bytes=fs.readFileSync(path.join(sourceDir,file.name));
 if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error(`Changed source: ${file.name}`);
 const decoded=run(['-loglevel','error','-i',path.join(sourceDir,file.name),'-ac','2','-ar',`${SR}`,'-f','f32le','-']).stdout;
 const pcm=new Float32Array(decoded.buffer.slice(decoded.byteOffset,decoded.byteOffset+decoded.byteLength));
 let peak=0;for(const x of pcm)peak=Math.max(peak,Math.abs(x));
 let first=0;while(first<pcm.length/2&&Math.max(Math.abs(pcm[first*2]),Math.abs(pcm[first*2+1]))<peak*.005)first++;
 return {...file,pcm,start:Math.max(0,first-72)};
});
function pianoVoice(note,velocity,hold,release){
 const source=sources.reduce((a,b)=>Math.abs(a.midi-note)<=Math.abs(b.midi-note)?a:b);
 if(Math.abs(source.midi-note)>1)throw new Error(`Uncovered piano pitch ${note}`);
 const rate=2**((note-source.midi)/12),d=hold+release,channels=[arr(d),arr(d)];
 // One source velocity per pitch: this filter/gain approximation is not multi-velocity sampling.
 const coef=1-Math.exp(-TAU*(2100+velocity*6400)/SR),gain=velocity**1.6;
 for(let c=0;c<2;c++){
  let previous=0;
  for(let i=0;i<channels[c].length;i++){
   const read=source.start+i*rate,index=Math.floor(read),fraction=read-index;
   if((index+1)*2+c>=source.pcm.length)break;
   let value=source.pcm[index*2+c]*(1-fraction)+source.pcm[(index+1)*2+c]*fraction;
   previous+=coef*(value-previous);value=previous;
   const t=i/SR,releaseProgress=Math.max(0,(t-hold)/release);
   const damper=releaseProgress===0?1:Math.exp(-5*releaseProgress)*(1-smooth((releaseProgress-.8)/.2));
   channels[c][i]=value*gain*smooth(t/.0015)*damper;
  }
 }
 return channels;
}
function electronic(note,duration,kind,seed=1){
 const f=hz(note),random=rng(seed),raw=arr(duration);let phase=0,lp=0;
 for(let i=0;i<raw.length;i++){
  const t=i/SR,p=t/duration;
  const glide=kind==='zip'?1+.65*Math.exp(-t/.023):kind==='spark'?1+.09*Math.exp(-t/.012):1;
  phase+=TAU*f*glide/SR;
  const bright=kind==='pulse'?.20:kind==='spark'?.07:.13;
  const carrier=Math.sin(phase+.45*Math.exp(-t/.03)*Math.sin(2*phase))+.23*Math.sin(3*phase)+bright*Math.sin(5*phase);
  const noise=random();lp+=.22*(noise-lp);
  const envelope=smooth(t/.0025)*Math.exp(-t/(duration*.27))*smooth((duration-t)/.012);
  raw[i]=(carrier+.12*(noise-lp)*Math.exp(-t/.008))*envelope;
 }
 return normalize(filter(raw,'low',kind==='pulse'?2500:5800));
}
function sub(note,duration=.45){
 const f=hz(note);
 return normalize(arr(duration).map((_,i)=>{const t=i/SR;return (Math.sin(TAU*f*t)+.28*Math.sin(TAU*f*2*t)+.075*Math.sin(TAU*f*3*t))*smooth(t/.012)*Math.exp(-t/.14)*smooth((duration-t)/.06);}));
}
function sweep(duration,seed,direction=1){
 const random=rng(seed),input=arr(duration).map(()=>random());
 const low=filter(filter(input,'low',1200),'high',250),high=filter(filter(input,'low',5300),'high',2000);
 return normalize(low.map((x,i)=>{const p=i/(low.length-1),t=i/SR,s=direction>0?p:1-p;return (x*(1-s*.65)+high[i]*(.1+.38*s))*(.86+.14*Math.sin(TAU*(18*t+13*t*t)))*Math.sin(Math.PI*p)**1.8;}));
}
function prism(notes,duration){
 const raw=arr(duration);
 for(let v=0;v<notes.length;v++){
  const f=hz(notes[v]);
  for(let i=0;i<raw.length;i++){
   const t=i/SR;
   raw[i]+=(Math.sin(TAU*f*t+.035*Math.sin(TAU*.5*t+v))+.14*Math.sin(TAU*f*2*t))*(.9+.1*Math.sin(TAU*4*t+v));
  }
 }
 return normalize(raw.map((v,i)=>{const t=i/SR;return v*smooth(t/.24)*smooth((duration-t)/.8);}));
}
function room(input,c,rt){
 const sum=new Float64Array(input.length),delays=c===0?[1499,1747,1999,2371]:[1553,1823,2081,2467];
 for(const d of delays){const ring=new Float64Array(d),feedback=10**(-3*d/SR/rt);let at=0,low=0;for(let i=0;i<input.length;i++){const value=ring[at];low=.40*low+.60*value;ring[at]=input[i]+feedback*low;sum[i]+=value*.25;at=(at+1)%d;}}
 let output=sum;
 for(const d of c===0?[241,617]:[283,661]){const ring=new Float64Array(d),next=new Float64Array(input.length);let at=0;for(let i=0;i<input.length;i++){const v=ring[at];next[i]=v-.55*output[i];ring[at]=output[i]+.55*next[i];at=(at+1)%d;}output=next;}
 return filter(filter(output,'low',4400),'high',170);
}
function score(id,title,duration,style,sections){
 const n=Math.round(duration*SR),bus=()=>({dry:[new Float64Array(n),new Float64Array(n)],send:new Float64Array(n)});
 return {id,title,duration,style,sections,piano:bus(),digital:bus(),events:[],serial:1};
}
function put(s,bus,at,signal,gain,pan,label,send=.12){
 const stereo=Array.isArray(signal),length=stereo?signal[0].length:signal.length,offset=Math.round(at*SR);
 if(offset<0||offset+length>s.piano.dry[0].length)throw new Error(`Cue out of bounds: ${s.id} ${label} at ${at}`);
 const g=[Math.cos((pan+1)*Math.PI/4),Math.sin((pan+1)*Math.PI/4)];
 for(let i=0;i<length;i++){
  const left=stereo?signal[0][i]:signal[i],right=stereo?signal[1][i]:signal[i],mid=(left+right)/2,side=(left-right)*.28;
  bus.dry[0][offset+i]+=(mid+side)*gain*g[0];bus.dry[1][offset+i]+=(mid-side)*gain*g[1];bus.send[offset+i]+=mid*gain*send;
 }
 s.events.push({at,duration:length/SR,label,layer:bus===s.piano?'piano':'electronics',gain,pan});
}
function key(s,at,n,velocity=.64,hold=.35,release=.5){
 const seed=s.serial++,jitter=.005*Math.sin(seed*2.37),pan=Math.max(-.22,Math.min(.22,(n-60)*.009));
 put(s,s.piano,Math.max(.01,at+jitter),pianoVoice(n,velocity,hold,release),.6,pan,`piano ${n}`,.23);
}
function chord(s,at,notes,vel=.59,hold=.6,release=.65){notes.forEach((n,i)=>key(s,at+i*.009,n,vel*(1-i*.023),hold,release));}
function digi(s,at,n,gain=.05,kind='spark',duration=.13,pan=0){put(s,s.digital,at,electronic(n,duration,kind,s.serial++),gain,pan,`${kind} ${n}`,kind==='zip'?.08:.15);}
function zip(s,at,notes,gain=.052,step=.055){notes.forEach((n,i)=>digi(s,at+i*step,n,gain*(1-i*.09),'zip',.105,-.28+.56*i/Math.max(1,notes.length-1)));}
function bass(s,at,n,gain=.055){put(s,s.digital,at,sub(n),gain,0,`electronic low body ${n}`,.015);}
function air(s,at,duration,gain=.025,dir=1){put(s,s.digital,at,sweep(duration,s.serial++,dir),gain,0,'spectral travel',.07);}
function glow(s,at,notes,duration,gain=.029){put(s,s.digital,at,prism(notes,duration),gain,0,'harmonic light',.24);}

// 01 — a miniature 6/8 invention: the digital voice answers in the piano's rests.
function clockwork(){
 const s=score('01-clockwork-bloom','Clockwork Bloom',28.6,{meter:'6/8',tempo:'80 dotted-quarter BPM',key:'D major',idea:'A lilting piano invention acquires a quicksilver second voice.'},[{at:0,title:'The piano proposes'},{at:6.1,title:'A second intelligence answers'},{at:12.1,title:'The gears briefly slip'},{at:15.1,title:'Two voices find each other'},{at:21.1,title:'A bright little cadence'}]);
 const harmony=[[50,57,62,66],[49,57,61,64],[47,54,59,62],[43,50,59,62],[40,47,55,59],[45,52,61,64],[42,50,57,62],[43,50,59,62],[40,47,55,62],[45,52,61,67],[50,57,62,66],[49,57,61,64],[47,54,59,62],[43,50,59,62],[45,52,61,67],[50,57,62,66]];
 const melody=[[[0,74,2],[2,78,1],[3,76,2],[5,81,1]],[[0,76,3],[3,73,2]],[[0,74,2],[2,73,1],[3,71,3]],[[0,74,2],[3,71,1],[4,69,2]],[[0,67,2],[2,69,1],[3,71,2]],[[0,73,2],[2,74,1],[3,76,2]],[[0,78,2],[2,76,1],[3,74,2]],[[0,71,3],[3,74,2]],[[0,76,2],[2,74,1]],[[0,73,3]],[[0,74,2],[2,78,1],[3,81,2],[5,83,1]],[[0,81,2],[2,78,1],[3,76,2]],[[0,78,2],[2,76,1],[3,74,2]],[[0,74,2],[2,71,1],[3,69,2]],[[0,73,2],[2,76,1],[3,73,2]],[[0,74,6]]];
 harmony.forEach((h,b)=>{
  const t=.1+b*1.5,velocity=b<4?.56:b<8?.64:b<10?.54:.7;
  if(b!==9){key(s,t,h[0],velocity+.025,.45,.5);key(s,t+.5,h[2],velocity-.09,.21,.34);key(s,t+.75,h[1],velocity-.03,.36,.42);key(s,t+1.25,h[3],velocity-.08,.17,.35);}else{chord(s,t,h,.49,.6,.38);}
  for(const [e,n,l] of melody[b])key(s,t+e*.25+.018,n,velocity+.085,l*.25*.82,b===15?2.5:.42);
  if(b>=4&&b!==8&&b!==9&&b!==15){
   const response=b%2===0?[h[2]+12,h[3]+12,h[2]+19]:[h[3]+12,h[2]+12];
   zip(s,t+1.12,response,b>=10?.051:.034,.057);
   digi(s,t+.625,h[3]+12,.022,'spark',.085,-.18);
  }
  if(b>=10&&b<15){bass(s,t,h[0]-12,.027);digi(s,t+.875,h[2],.024,'pulse',.1,.13);}
 });
 zip(s,2.15,[86,81],.02,.075);air(s,5.7,.45,.018);zip(s,12.7,[83,85,88],.035,.041);air(s,14.6,.55,.029);
 glow(s,15.15,[74,78,81],2.5,.012);air(s,20.8,.48,.016,-1);zip(s,22.78,[81,78,74],.039,.065);
 chord(s,24.12,[38,50,57,62,66,74],.64,.8,2.85);digi(s,24.18,86,.017,'spark',.16,.08);
 return s;
}

// 02 — regular piano motion meets a 3+3+2 electronic cross-rhythm; one freezes mid-phrase.
function voltage(){
 const q=60/112,bar=4*q,offset=.1;
 const s=score('02-glass-and-voltage','Glass & Voltage',12*bar+3.65,{meter:'4/4',tempo:'112 BPM',key:'E-flat major',idea:'Flowing piano glass meets short, angular bursts of electricity.'},[{at:0,title:'Glass in motion'},{at:2*bar,title:'Voltage cuts across'},{at:5*bar,title:'The circuit catches its breath'},{at:6*bar,title:'Interlocking motion'},{at:10*bar,title:'Piano leads it home'}]);
 const hs=[[39,55,58,63,67],[44,55,60,63,67],[48,55,58,63,67],[46,53,58,62,65],[41,56,60,63,68],[46,53,58,63,65],[39,55,58,63,67],[44,55,60,63,67],[48,55,58,63,67],[41,56,60,63,68],[46,53,56,62,65],[39,55,58,63,67]];
 const tops=[[79,77],[79,84],[82,79],[77,74],[80,79],[77],[79,82],[84,82],[79,77],[80,79],[77,74],[75]];
 hs.forEach((h,b)=>{
  const t=offset+b*bar;
  key(s,t,h[0],b<2?.61:.73,.7,.6);key(s,t+2*q,h[0]+12,.47,.38,.4);
  const pattern=b%2===0?[1,2,3,4,3,2,4,3]:[1,3,2,4,2,3,4,2];
  const count=b===5?3:b===11?4:8;
  for(let e=0;e<count;e++)key(s,t+e*q/2+.01,h[pattern[e]],(e%4===0?.60:.48)+(b>=6?.07:0),.17,.37);
  tops[b].forEach((n,i)=>key(s,t+q*(i===0?.48:2.5),n,b>=6?.79:.68,.54,b===11?1.8:.5));
  if(b>=2&&b!==5&&b!==11){
   for(const [j,g] of [[0,.051],[3,.034],[6,.045]]){
    const at=t+j*q/2+.04;
    digi(s,at,h[2]+12,g,'pulse',.15,j===3?-.24:.18);
    if(b>=6)digi(s,at+.067,h[4]+12,g*.55,'spark',.07,-.12);
   }
   bass(s,t,h[0]-12,.057);bass(s,t+1.5*q,h[0]-12,.026);bass(s,t+3*q,h[0]-12,.034);
   zip(s,t+3.48*q,[h[2]+12,h[4]+12,h[3]+24],b>=6?.052:.042,.042);
  }
 });
 zip(s,1.84,[82,86,87],.035,.04);air(s,4.0,.55,.026);air(s,9.95,.65,.027,-1);
 // A tiny reversed-color gesture before the full cadence returns, not a huge cinematic riser.
 zip(s,12.35,[77,79,82,86],.042,.055);air(s,12.2,.55,.028);glow(s,13.0,[75,79,82],2.1,.018);
 air(s,21.9,.48,.023,-1);zip(s,24.35,[82,79,77,75],.042,.053);
 const end=offset+12*bar;
 chord(s,end,[39,51,58,63,67,75],.69,.7,2.65);bass(s,end,39,.04);digi(s,end+.09,87,.015,'spark',.14,.12);
 return s;
}

// 03 — rubato piano first; technology is a widening answering voice, not a beat grid.
function tomorrow(){
 const lengths=[2.9,2.6,2.8,2.5,2.7,2.4,2.8,2.6,2.9,3.0],total=lengths.reduce((a,b)=>a+b,0);
 const s=score('03-tomorrow-softly','Tomorrow, Softly',total+4.2,{meter:'4/4 with authored rubato',tempo:'Approximately 80–100 BPM; explicitly varying phrase lengths',key:'A major',idea:'An intimate piano phrase discovers a luminous electronic horizon.'},[{at:0,title:'An intimate question'},{at:5.5,title:'A signal in the distance'},{at:10.8,title:'The horizon gathers'},{at:15.9,title:'A held breath'},{at:18.7,title:'The answer opens'},{at:24.2,title:'Hope, without a fanfare'}]);
 const harmony=[[45,52,61,64,71],[44,52,59,64,68],[42,49,57,61,64],[38,50,57,61,66],[47,54,57,61,66],[40,52,57,59,64],[40,52,56,59,62],[45,52,61,64,71],[38,50,57,61,66],[45,52,57,61,64]];
 const melodies=[[[.18,76,.29],[.57,73,.26],[.83,71,.14]],[[.12,69,.4],[.65,71,.24]],[[.1,73,.3],[.5,76,.27],[.83,78,.14]],[[.1,76,.42],[.68,73,.22]],[[.12,74,.24],[.43,76,.24],[.76,78,.16]],[[.1,76,.35],[.63,71,.18]],[[.10,74,.35]],[[.1,81,.31],[.48,80,.18],[.73,78,.19]],[[.12,76,.27],[.45,78,.24],[.78,76,.16]],[[.12,73,.29],[.52,71,.18],[.8,69,.16]]];
 let t=.14;
 harmony.forEach((h,b)=>{
  const duration=lengths[b],v=b<2?.59:b<6?.65:b===6?.53:.76;
  chord(s,t,[h[0],h[1]],v,duration*.45,.9);
  chord(s,t+duration*.25,h.slice(2,4),v-.12,duration*.34,.65);
  if(b!==6)key(s,t+duration*.63,h[4],v-.1,duration*.25,.65);
  for(const [p,n,length] of melodies[b])key(s,t+p*duration,n,v+.08,length*duration,b===9?.9:.7);
  if(b>=2&&b!==6){
   zip(s,t+duration*.68,[h[3]+12,h[4]+12],b>=7?.044:.026,.075);
   digi(s,t+duration*.91,h[2]+24,b>=7?.025:.016,'spark',.18,-.22);
  }
  if(b===4||b===5)zip(s,t+duration*.37,[h[2]+12,h[3]+12,h[4]+12],.031,.062);
  if(b>=7){
   glow(s,t+.12,[h[2]+12,h[3]+12,h[4]+12],duration+.35,b===7?.035:.025);
   bass(s,t,h[0]-12,b===7?.058:.036);
   digi(s,t+duration*.42,h[2]+12,.028,'pulse',.12,-.18);
   digi(s,t+duration*.48,h[3]+12,.019,'spark',.075,.15);
  }
  t+=duration;
 });
 air(s,5.15,.65,.017);air(s,10.42,.7,.026);air(s,14.95,.7,.023,-1);
 air(s,18.18,.64,.029);zip(s,18.35,[76,80,83,85],.039,.055);
 air(s,23.8,.8,.019,-1);
 chord(s,total+.14,[33,45,52,57,61,64,69],.64,.8,2.85);
 glow(s,total+.2,[73,76,81],2.9,.014);digi(s,total+.21,85,.014,'spark',.2,.15);
 return s;
}
function finish(s,bus,rt){
 const verb=[room(bus.send,0,rt),room(bus.send,1,rt)];
 return bus.dry.map((ch,c)=>filter(ch.map((v,i)=>{const t=i/SR;return (v+verb[c][i])*smooth(t/.008)*smooth((s.duration-t)/.5);}), 'high',27));
}
function floatWav(channels){
 const n=channels[0].length,b=Buffer.alloc(44+n*8);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(3,20);b.writeUInt16LE(2,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*8,28);b.writeUInt16LE(8,32);b.writeUInt16LE(32,34);b.write('data',36);b.writeUInt32LE(n*8,40);
 for(let i=0;i<n;i++)for(let c=0;c<2;c++){const v=channels[c][i];if(!Number.isFinite(v))throw new Error('Nonfinite PCM');b.writeFloatLE(v,44+i*8+c*4);}return b;
}
function measure(file){const r=run(['-i',file,'-af','loudnorm=I=-21:TP=-2:LRA=11:print_format=json','-f','null','-']);const m=r.stderr.toString().match(/\{\s*"input_i"[\s\S]*?\}/);if(!m)throw new Error('Missing measurements');const j=JSON.parse(m[0]);return {integratedLUFS:Number(j.input_i),truePeakDbTP:Number(j.input_tp),loudnessRangeLU:Number(j.input_lra)};}
const jobs=[];
for(const compose of [clockwork,voltage,tomorrow]){
 const s=compose(),piano=finish(s,s.piano,s.id.startsWith('03')?1.35:.95),digital=finish(s,s.digital,.74);
 const mix=[0,1].map(c=>piano[c].map((x,i)=>x+digital[c][i]));
 const files={};for(const [name,ch] of [['full',mix],['piano',piano],['electronics',digital]]){const file=path.join(out,`.${s.id}-${name}.float.wav`);fs.writeFileSync(file,floatWav(ch));files[name]=file;}
 let energy=0,mono=0,dc=0;for(let i=0;i<mix[0].length;i++){const l=mix[0][i],r=mix[1][i];energy+=(l*l+r*r)/2;mono+=((l+r)/2)**2;dc+=l+r;}
 const measured=measure(files.full);jobs.push({id:s.id,title:s.title,duration:s.duration,style:s.style,sections:s.sections,events:s.events.sort((a,b)=>a.at-b.at),files,before:measured,monoEnergyRatio:mono/energy,dcMean:dc/(mix[0].length*2)});
 console.log(`Composed ${s.title}: ${s.events.length} events.`);
}
// All three share the same achievable loudness, rather than making the busier cue win by level.
const target=Math.min(-21,...jobs.map(j=>j.before.integratedLUFS+(-2.3-j.before.truePeakDbTP)));
for(const job of jobs){
 const gain=target-job.before.integratedLUFS;
 for(const [layer,source] of Object.entries(job.files)){
  const name=`${job.id}${layer==='full'?'':`-${layer}`}.wav`;
  run(['-loglevel','error','-y','-i',source,'-af',`volume=${gain}dB,aresample=dither_method=triangular`,'-c:a','pcm_s16le',path.join(out,name)]);
 }
 const wav=path.join(out,`${job.id}.wav`);job.measurements=measure(wav);job.gainDb=gain;
 if(job.measurements.truePeakDbTP>-2)throw new Error(`True peak violation: ${job.id}`);
 if(Math.abs(job.measurements.integratedLUFS-target)>.3)throw new Error(`Loudness mismatch: ${job.id}`);
 run(['-loglevel','error','-y','-i',wav,'-c:a','libmp3lame','-b:a','256k',path.join(out,`${job.id}.mp3`)]);
 job.mp3Measurements=measure(path.join(out,`${job.id}.mp3`));if(job.mp3Measurements.truePeakDbTP>-1)throw new Error(`Encoded peak violation: ${job.id}`);
 job.sha256=createHash('sha256').update(fs.readFileSync(wav)).digest('hex');
 for(const file of Object.values(job.files))fs.unlinkSync(file);delete job.files;
 console.log(`${job.title}: ${job.measurements.integratedLUFS} LUFS, ${job.measurements.truePeakDbTP} dBTP`);
}
const manifest={version:3,status:'Three unapproved continuous composition studies; not synchronized to picture.',sampleRate:SR,pcm:'16-bit stereo',pianoAttribution:{instrument:sourceManifest.instrument,author:sourceManifest.author,license:sourceManifest.license,licenseUrl:sourceManifest.licenseUrl,repository:sourceManifest.repository,commit:sourceManifest.commit,changes:'Source notes decoded from MP3, transposed at most one semitone, gain/filter-shaped for note velocity, given note-off envelopes, narrowed/panned, reverberated, and arranged into new compositions.'},electronicProvenance:'Original deterministic oscillator/noise synthesis. No audio or melody from the reference video.',mastering:{targetLUFS:target,method:'Constant gain only. All cues matched to the same safely achievable integrated loudness, with at least 2 dB true-peak headroom. Aligned stems retain their full-mix gains.'},studies:jobs};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.copyFileSync(path.join(sourceDir,'UPSTREAM-README.txt'),path.join(out,'SALAMANDER-UPSTREAM-README.txt'));
console.log(`Saved three completed studies to ${out}`);
