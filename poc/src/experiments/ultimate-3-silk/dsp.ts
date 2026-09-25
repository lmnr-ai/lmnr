import {SAMPLE_RATE,type StereoPCM} from './types';
import {smooth} from './motion';
export const TAU=2*Math.PI;
export const hz=(midi:number)=>440*2**((midi-69)/12);
export const CALIBRATION=10**(-5.14/20); // Fixed approved Refined audition calibration, never per-film normalization.
export const stereo=(n:number):StereoPCM=>[new Float32Array(n),new Float32Array(n)];
export function filter(input:Float32Array,type:'low'|'high',frequency:number,q=Math.SQRT1_2):Float32Array {
  const w=TAU*frequency/SAMPLE_RATE,c=Math.cos(w),a=Math.sin(w)/(2*q),a0=1+a,a1=-2*c/a0,a2=(1-a)/a0,b0=(type==='low'?(1-c)/2:(1+c)/2)/a0,b1=(type==='low'?1-c:-(1+c))/a0;
  const output=new Float32Array(input.length);let x1=0,x2=0,y1=0,y2=0;
  for(let i=0;i<input.length;i++){const x=input[i],y=b0*x+b1*x1+b0*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;output[i]=y;}
  return output;
}
export function addMono(out:StereoPCM,voice:Float32Array,at:number,gain:number,pan=0) {
  const base=Math.round(at*SAMPLE_RATE),angle=(pan+1)*Math.PI/4,l=Math.cos(angle)*gain,r=Math.sin(angle)*gain;
  for(let i=Math.max(0,-base);i<voice.length&&base+i<out[0].length;i++){out[0][base+i]+=voice[i]*l;out[1][base+i]+=voice[i]*r;}
}
export function reflect(input:StereoPCM,taps:readonly (readonly [number,number,boolean])[]):StereoPCM {
  const out=stereo(input[0].length);
  for(let c=0;c<2;c++)for(let i=0;i<input[0].length;i++){
    let x=input[c][i];for(const [seconds,gain,cross] of taps){const j=i-Math.round((seconds+c*.003)*SAMPLE_RATE);if(j>=0)x+=input[cross?1-c:c][j]*gain;}out[c][i]=x;
  }
  return out;
}
export function terminalFade(pcm:StereoPCM,end:number,duration=.08) {
  const stop=Math.min(pcm[0].length,Math.ceil(end*SAMPLE_RATE)),fade=Math.min(duration,end);
  for(let c=0;c<2;c++){
    for(let i=Math.max(0,Math.floor((end-fade)*SAMPLE_RATE));i<stop;i++)pcm[c][i]*=smooth((end-i/SAMPLE_RATE)/Math.max(fade,1/SAMPLE_RATE));
    pcm[c].fill(0,stop);
  }
}
export function pcmPeak(pcm:StereoPCM):number {
  let peak=0;for(const ch of pcm)for(const x of ch){if(!Number.isFinite(x))throw new Error('Nonfinite Silk PCM');peak=Math.max(peak,Math.abs(x));}return peak;
}
/** Canonical float WAV keeps raw stems exactly aligned and avoids lossy browser decoding. */
export function encodeSilkWav(pcm:StereoPCM):Uint8Array {
  if(pcm[0].length!==pcm[1].length)throw new Error('Unequal Silk channels');
  if(pcmPeak(pcm)>=1)throw new Error('Silk mix clips: reduce master/bus gains before export');
  const n=pcm[0].length,bytes=new Uint8Array(44+n*8),v=new DataView(bytes.buffer);
  const text=(s:string,at:number)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
  text('RIFF',0);v.setUint32(4,bytes.length-8,true);text('WAVEfmt ',8);v.setUint32(16,16,true);v.setUint16(20,3,true);v.setUint16(22,2,true);v.setUint32(24,SAMPLE_RATE,true);v.setUint32(28,SAMPLE_RATE*8,true);v.setUint16(32,8,true);v.setUint16(34,32,true);text('data',36);v.setUint32(40,n*8,true);
  for(let i=0;i<n;i++)for(let c=0;c<2;c++)v.setFloat32(44+i*8+c*4,pcm[c][i],true);
  return bytes;
}
