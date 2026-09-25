import {assertSilkHeadroom,silkStemPeaks} from './headroom';
import {ASSET_IDENTITY} from './assets';
import {assertSilkResources} from './resources';
import {buildSilkPlan} from './plan';
import {SILK_BUSES,SAMPLE_RATE,RECIPE_VERSION,normalizeSilkMix,type SilkPlan,type SilkStems,type SilkMix,type VerifiedPianoPCM,type StereoPCM} from './types';
import {stereo,terminalFade,pcmPeak} from './dsp';
import {createOrnamentVoice,renderRotor,renderCue} from './voices';
import {renderMusicEvent} from './music-pcm';
function* renderSteps(plan:SilkPlan,assets:VerifiedPianoPCM):Generator<void,SilkStems> {
  if(plan.recipeVersion!==RECIPE_VERSION||plan.assetIdentity!==ASSET_IDENTITY||assets.assetIdentity!==ASSET_IDENTITY)throw new Error('Silk renderer/assets identity mismatch');
  const budget=assertSilkResources(plan.semanticDuration,plan.sampleRate);
  if(plan.sampleRate!==SAMPLE_RATE||plan.frameDuration!==budget.frameDuration)throw new Error('Silk sample/frame format mismatch');
  const n=budget.samples,stems=Object.fromEntries(SILK_BUSES.map(bus=>[bus,stereo(n)])) as SilkStems;
  const ornament=createOrnamentVoice(assets);
  for(const motion of plan.motions){renderRotor(motion,stems.agent);yield;}
  for(const cue of plan.cues){renderCue(cue,stems[cue.bus],ornament);yield;}
  for(const event of plan.music.events){renderMusicEvent(event,plan,stems.music);yield;}
  for(const bus of SILK_BUSES){
    terminalFade(stems[bus],plan.semanticDuration);
    // Canonical 24-bit musical output removes sub-ULP transcendental differences between
    // Node and Chrome while retaining >140dB numerical resolution; no level normalization.
    if(bus==='music')for(const ch of stems[bus])for(let i=0;i<ch.length;i++)ch[i]=Math.round(ch[i]*8388608)/8388608;
    if(pcmPeak(stems[bus])>=1)throw new Error(`Raw ${bus} stem clips`);
  }
  return stems;
}
export function renderSilkPCM(plan:SilkPlan,assets:VerifiedPianoPCM):SilkStems {
  const steps=renderSteps(plan,assets);let step=steps.next();while(!step.done)step=steps.next();return step.value;
}
export async function renderSilkPCMAsync(plan:SilkPlan,assets:VerifiedPianoPCM,signal?:AbortSignal):Promise<SilkStems> {
  const steps=renderSteps(plan,assets);let step:IteratorResult<void,SilkStems>;
  do{signal?.throwIfAborted();step=steps.next();if(!step.done)await new Promise<void>(resolve=>setTimeout(resolve,0));}while(!step.done);
  signal?.throwIfAborted();return step.value;
}
export function mixSilkPCM(stems:SilkStems,input:Partial<SilkMix>={}):StereoPCM {
  assertSilkHeadroom(silkStemPeaks(stems),input);
  const mix=normalizeSilkMix(input),n=stems.agent[0].length,out=stereo(n);
  for(const bus of SILK_BUSES){
    if(stems[bus][0].length!==n||stems[bus][1].length!==n)throw new Error('Silk stem length mismatch');
    if(mix[bus]===0||mix.master===0)continue;
    for(let c=0;c<2;c++)for(let i=0;i<n;i++)out[c][i]+=stems[bus][c][i]*mix[bus]*mix.master;
  }
  if(pcmPeak(out)>=1)throw new Error('Silk mix clips: reduce master/bus gains');return out;
}
/** Integration must call before mounting export Audio. Never accept default audio under retimed picture. */
export function assertSilkExportIdentity(manifest:{identity:string;mixIdentity:string},plan:SilkPlan,mixKey:string) {
  if(manifest.identity!==plan.identity||manifest.mixIdentity!==mixKey)throw new Error('Silk export does not match current settings/mix. Rebuild with render-ultimate3-silk.ts.');
}
export {buildSilkPlan};
