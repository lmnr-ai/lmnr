import type {MusicEvent} from '../micro-18/ultimate3-music';
import {SAMPLE_RATE,type SilkPlan,type StereoPCM} from './types';
import {TAU,hz,filter,addMono} from './dsp';
const exponential=(a:number,b:number,p:number)=>a*(b/a)**Math.max(0,Math.min(1,p));
// Piecewise triangle avoids engine-specific asin rounding at the waveform corners.
const triangle=(phase:number)=>{const cycle=((phase/TAU)%1+1)%1;return cycle<.25?4*cycle:cycle<.75?2-4*cycle:4*cycle-4;};
/** Optional uncompressed interpretation of Ultimate3MusicEngine, NOT a replacement arrangement.
 * Same events/partials/envelopes/pans/chapter multipliers. Triangle aliasing and filter phase
 * differ from WebAudio; both new editor and export use THIS PCM. Original engine untouched.
 */
export function renderMusicEvent(event:MusicEvent,plan:SilkPlan,out:StereoPCM) {
  if(event.at>=plan.semanticDuration)return;
  const starts=plan.chapterStarts,phase=event.at<starts.cost?'opening':event.at<starts.flow?'cost':event.at<starts.issues?'flow':event.at<starts.conclusion?'issues':'conclusion';
  const duration=Math.max(.06,event.duration);
  const voice=(pitch:number,seconds:number,pan:number,wave:(t:number)=>number,envelope:(t:number)=>number,lowpass=false)=>{
    const n=Math.max(0,Math.min(Math.ceil(seconds*SAMPLE_RATE),out[0].length-Math.round(event.at*SAMPLE_RATE))),raw=new Float32Array(n);
    for(let i=0;i<n;i++){const t=i/SAMPLE_RATE;raw[i]=wave(t)*envelope(t);}
    // .18 is the standalone existing engine's optional-context level, not an instruction to enable music.
    addMono(out,lowpass?filter(raw,'low',1800,1):raw,event.at,.18,pan);
  };
  const pad=event.voice==='harmony'||(event.voice==='finale'&&event.notes.length>1);
  if(pad){
    const velocity=event.gain*(phase==='issues'?.48:.72),attack=Math.min(.22,duration*.25),release=Math.min(.5,duration*.3),peak=velocity*.025/Math.sqrt(event.notes.length);
    event.notes.forEach((pitch,index)=>voice(pitch,duration+.04,(index-(event.notes.length-1)/2)*.12,t=>triangle(TAU*hz(pitch)*t),t=>t<attack?.0001+(peak-.0001)*t/attack:t<Math.max(attack,duration-release)?peak:exponential(peak,.0001,(t-Math.max(attack,duration-release))/(duration-Math.max(attack,duration-release)))));
  }else if(event.voice==='motion'){
    const pitch=event.notes[0],release=Math.min(.8,duration+.35);
    [1,2.01,3.98].forEach((ratio,index)=>{
      const peak=event.gain*.035/(index+1);
      voice(pitch,release+.04,index===1?.2:-.12,t=>Math.sin(TAU*hz(pitch)*ratio*t),t=>t<.008?exponential(.0001,peak,t/.008):exponential(peak,.0001,(t-.008)/(release-.008)));
    });
  }else{
    const pitch=event.notes[0],velocity=event.gain*(phase==='issues'?.62:phase==='flow'?.88:.76),release=Math.min(duration+.7,2.4);
    for(let harmonic=1;harmonic<=4;harmonic++){
      const peak=Math.max(.0002,velocity*.075*.55**(harmonic-1)/Math.sqrt(harmonic));
      voice(pitch,Math.min(duration+.75,2.45),((pitch%7)-3)*.035,t=>Math.sin(TAU*hz(pitch)*harmonic*(1+harmonic*harmonic*.0003)*t),t=>t<.018?exponential(.0001,peak,t/.018):exponential(peak,.0001,(t-.018)/(release-.018)));
    }
    if(phase==='flow'&&event.voice==='melody'){
      const peak=event.gain*.22*.035,attack=Math.min(.12,duration*.3);
      voice(pitch-12,duration+.04,-.12,t=>triangle(TAU*hz(pitch-12)*t),t=>t<attack?.0001+(peak-.0001)*t/attack:exponential(peak,.0001,(t-attack)/(duration-attack)),true);
    }
  }
}
