import {SAMPLE_RATE,type SilkMotion,type SilkCue,type StereoPCM,type VerifiedPianoPCM} from './types';
import {clamp,smooth} from './motion';
import {TAU,hz,stereo,filter,reflect,addMono,CALIBRATION} from './dsp';
const PARTIALS=[[2,.12],[3,.16],[4,.12],[6,.062],[8,.025],[10,.013],[12,.005]] as const;
export function renderRotor(motion:SilkMotion,out:StereoPCM) {
  const points=motion.points;if(points.length<2)return;
  const start=points[0].time,base=Math.floor(start*SAMPLE_RATE),n=Math.ceil(points.at(-1)!.time*SAMPLE_RATE)-base;
  const raw=stereo(n),mask=new Float32Array(n);
  const active=points.slice(0,-1).map((p,i)=>Math.abs(points[i+1].turns-p.turns)>1e-12&&(p.gain>0||points[i+1].gain>0));
  const runStart:number[]=[],runEnd:number[]=[];
  for(let i=0;i<active.length;i++)runStart[i]=active[i]&&i>0&&active[i-1]?runStart[i-1]:points[i].time;
  for(let i=active.length-1;i>=0;i--)runEnd[i]=active[i]&&i+1<active.length&&active[i+1]?runEnd[i+1]:points[i+1].time;
  let carrierCycles=hz(38)*.983*start;
  for(let j=0;j<points.length-1;j++){
    const p=points[j],q=points[j+1],dt=q.time-p.time;
    // Adding a chapter offset can coalesce two boundaries separated only by an ULP.
    if(dt<=0)continue;
    const rps=(q.turns-p.turns)/dt;
    // Bound translation-derived pitch deviation, not angular phase. Instantaneous authored
    // position steps must not create carrier discontinuities or an audible teleport impulse.
    const carrierRate=hz(38)*(.983+.017*clamp(Math.abs(q.distance-p.distance)/dt/660,0,2));
    const carrierStart=carrierCycles;carrierCycles+=carrierRate*dt;
    if(!active[j])continue;
    const modulation=1/(1+(Math.abs(rps)/30)**4); // Reduce depth, NEVER replace actual phase with a capped/fake clock.
    const speed=clamp(Math.abs(rps)/1.9,0,1.32),load=.83+.17*speed;
    for(let index=Math.max(base,Math.ceil(p.time*SAMPLE_RATE));index<Math.ceil(q.time*SAMPLE_RATE);index++){
      const i=index-base,t=index/SAMPLE_RATE,u=clamp((t-p.time)/dt),theta=TAU*(p.turns+(q.turns-p.turns)*u);
      const envelope=smooth((t-runStart[j])/.018)*smooth((runEnd[j]-t)/.025);
      const gain=(p.gain+(q.gain-p.gain)*u)*envelope*smooth(speed/.22);
      const brightness=clamp(p.brightness+(q.brightness-p.brightness)*u,.3,1);
      const cycles=carrierStart+carrierRate*(t-p.time);
      const pressure=.91+modulation*(.09*Math.cos(theta*10)+.025*Math.cos(theta*20+.4));
      const breath=.95+.05*modulation*Math.sin(theta-.4);
      let middle=0,side=0;
      for(const [harmonic,amp] of PARTIALS){
        const amplitude=amp*(harmonic>=6?brightness:1),phase=TAU*cycles*harmonic+harmonic*.81;
        const color=1+.12*modulation*Math.cos(theta+(harmonic%3)*TAU/3);
        const bend=modulation*(.07*Math.sin(theta)+.025*Math.sin(theta*10+.2*harmonic));
        middle+=amplitude*Math.sin(phase+bend)*color;
        side+=amplitude*.065*Math.sin(phase+.24*Math.sin(TAU*.34*t+harmonic));
      }
      const angle=(clamp(p.pan+(q.pan-p.pan)*u,-1,1)+1)*Math.PI/4;
      raw[0][i]=(middle+side)*gain*load*pressure*breath*Math.cos(angle);
      raw[1][i]=(middle-side)*gain*load*pressure*breath*Math.sin(angle);mask[i]=envelope;
    }
  }
  const processed=reflect([filter(filter(raw[0],'high',95),'low',1450),filter(filter(raw[1],'high',95),'low',1450)],[[.027,.035,false],[.061,.024,true],[.107,.012,false]]);
  for(let c=0;c<2;c++)for(let i=0;i<n&&base+i<out[c].length;i++)out[c][base+i]+=processed[c][i]*mask[i]*CALIBRATION;
}
export function createOrnamentVoice(assets:VerifiedPianoPCM) {
  const cache=new Map<number,Float32Array>();
  return (note:number)=>{
    if(cache.has(note))return cache.get(note)!;
    const midi=[...assets.samples.keys()].sort((a,b)=>Math.abs(a-note)-Math.abs(b-note)||a-b)[0];
    if(Math.abs(note-midi)>1)throw new Error('Silk ornament exceeds approved one-semitone transposition');
    const source=assets.samples.get(midi)!,n=Math.round(.42*SAMPLE_RATE),raw=new Float32Array(n),rate=2**((note-midi)/12);
    for(let i=0;i<n;i++){const at=source.onset+Math.round(.009*SAMPLE_RATE)+i*rate,j=Math.floor(at),f=at-j;if(j+1<source.pcm.length)raw[i]=source.pcm[j]*(1-f)+source.pcm[j+1]*f;}
    const upper=filter(filter(raw,'high',1050),'low',5600),body=filter(raw,'low',3200),shaped=new Float32Array(n);let peak=0;
    for(let i=0;i<n;i++){const t=i/SAMPLE_RATE,glass=Math.sin(TAU*hz(note)*t+.13*Math.exp(-t/.09)*Math.sin(TAU*hz(note)*2.006*t));shaped[i]=(.86*upper[i]+.14*body[i]+.004*glass)*smooth(t/.013)*Math.exp(-t/.19)*smooth((.42-t)/.1);peak=Math.max(peak,Math.abs(shaped[i]));}
    // Fixed reference-note calibration cached per pitch, independent of cue duration, mix or film.
    for(let i=0;i<n;i++)shaped[i]/=Math.max(peak,1e-12);
    cache.set(note,shaped);return shaped;
  };
}
export function renderCue(cue:SilkCue,out:StereoPCM,ornament:(note:number)=>Float32Array) {
  const n=Math.ceil(cue.duration*SAMPLE_RATE),raw=stereo(n);
  if(cue.recipe==='flourish'){
    for(const [index,note] of (cue.notes??[]).entries()){
      const offset=index*.13,source=ornament(note),length=Math.max(0,Math.min(source.length,n-Math.round(offset*SAMPLE_RATE))),voice=new Float32Array(length);
      for(let i=0;i<length;i++)voice[i]=source[i]*smooth((length-i)/SAMPLE_RATE/.08);
      addMono(raw,voice,offset,.18*(index===1?1.15:1)*cue.gain,cue.pan+(index-1)*.12);
    }
    const processed=reflect(raw,[[.063,.075,true],[.107,.035,false],[.173,.019,true],[.239,.009,false]]);
    for(let c=0;c<2;c++)for(let i=0;i<n;i++)raw[c][i]=processed[c][i]*smooth((n-i)/SAMPLE_RATE/.05);
  }else{
    const voice=new Float32Array(n);let state=cue.seed,noise=0;
    for(let i=0;i<n;i++){
      const t=i/SAMPLE_RATE,u=t/cue.duration;
      state^=state<<13;state^=state>>>17;state^=state<<5;noise=.94*noise+.06*((state>>>0)/2147483648-1);
      const physical=cue.recipe==='air'||cue.recipe==='release'||cue.recipe==='lift';
      const attack=cue.recipe==='touch'?.008:cue.recipe==='seat'?.012:.035;
      const envelope=smooth(t/Math.min(attack,cue.duration/3))*smooth((cue.duration-t)/Math.min(.13,cue.duration/2));
      const core=Math.sin(TAU*(cue.recipe==='halo'?hz(55):cue.recipe==='down'?hz(69)*(t-.035*t*t):185*t));
      let value=0;
      if(physical)value=(noise*.3+Math.sin(TAU*220*t)*.025)*Math.sin(Math.PI*u);
      else if(cue.recipe==='touch')value=(Math.sin(TAU*430*t)*.045+noise*.025)*Math.exp(-t/ .013);
      else if(cue.recipe==='halo')value=(Math.sin(TAU*hz(55)*t)+.2*Math.sin(TAU*hz(62)*t))*.07*Math.exp(-t/.48);
      else value=(core+.14*Math.sin(TAU*370*t))*.08*Math.exp(-t/.09);
      voice[i]=value*envelope*cue.gain;
    }
    addMono(raw,filter(voice,'low',cue.recipe==='air'?1100:1800),0,1,cue.pan);
  }
  const base=Math.round(cue.at*SAMPLE_RATE);
  for(let c=0;c<2;c++)for(let i=0;i<n&&base+i<out[c].length;i++)out[c][base+i]+=raw[c][i]*CALIBRATION;
}
