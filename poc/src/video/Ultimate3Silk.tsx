import {useEffect,useState} from 'react';
import {Audio,cancelRender,continueRender,delayRender,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {Ultimate3Scene} from '../experiments/micro-18/Scene';
import {sampleUltimate3} from '../experiments/micro-18/sample';
import {ULTIMATE_3_DEFAULTS,normalizeSettings} from '../experiments/micro-18/settings';
import {DEFAULT_SILK_MIX,canonical} from '../experiments/ultimate-3-silk/types';
import {validateSilkExport,type SilkExportProps} from '../experiments/ultimate-3-silk/export';
export const SILK_VIDEO_DEFAULTS:SilkExportProps={settings:ULTIMATE_3_DEFAULTS,mix:{...DEFAULT_SILK_MIX},audioDirectory:'ultimate-3-silk/default'};
const read=async(path:string)=>{const response=await fetch(staticFile(path));if(!response.ok)throw new Error(`Missing Silk export asset: ${path}. Generate matching assets with scripts/render-ultimate3-silk.ts.`);return response.arrayBuffer();};
// No PCM synthesis in Remotion workers. Both metadata and mounted audio verify generated assets.
export const silkMetadata=async({props}:{props:SilkExportProps})=>({durationInFrames:(await validateSilkExport(props,read)).frames});
export function Ultimate3Silk(props:SilkExportProps){
  const frame=useCurrentFrame(),{fps}=useVideoConfig(),settings=normalizeSettings(props.settings);
  const signature=canonical(props);
  const [handle]=useState(()=>delayRender('Validate current Silk settings, mix and WAV SHA-256'));
  const [validated,setValidated]=useState<{signature:string;path:string}|null>(null);
  useEffect(()=>{
    let live=true;const waiting=delayRender('Verify Silk PCM asset');
    void validateSilkExport(props,read).then(value=>{if(live){setValidated({signature,path:value.audioPath});continueRender(handle);continueRender(waiting);}}).catch(error=>{if(live)cancelRender(error);});
    return()=>{live=false;continueRender(waiting);};
  },[signature,handle]);
  return <><Ultimate3Scene sample={sampleUltimate3(frame/fps,settings)} settings={settings}/>{validated?.signature===signature&&<Audio src={staticFile(validated.path)}/>}</>;
}
