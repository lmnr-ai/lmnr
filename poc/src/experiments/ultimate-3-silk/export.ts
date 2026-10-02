import {assertSilkHeadroom,type SilkPeaks} from './headroom';
import {buildSilkPlan} from './plan';
import {assertSilkExportIdentity} from './render';
import {mixIdentity,SAMPLE_RATE,SILK_BUSES,type SilkMix} from './types';
import type {Ultimate3Settings} from '../micro-18/settings';
export type SilkExportProps={settings:Ultimate3Settings;mix:SilkMix;audioDirectory:string};
type FileRecord={sha256:string;samples:number;peak:number};
export type SilkExportManifest={identity:string;mixIdentity:string;currentMix:string;sampleRate:number;frameDuration:number;files:Record<string,FileRecord>};
export function silkAssetPath(directory:string,file:string){
  if(!/^ultimate-3-silk\/[a-zA-Z0-9_/-]+$/.test(directory)||directory.split('/').includes('..')||! /^[a-zA-Z0-9_-]+\.(?:json|wav)$/.test(file))throw new Error('Silk export requires a local public/ultimate-3-silk asset directory and plain filename.');
  return `${directory}/${file}`;
}
/** Validate identity AND the actual WAV bytes before allowing any export Audio node.
 * Fetches are injected so Node tests and Remotion use this same rejection contract. */
export async function validateSilkExport(props:SilkExportProps,read:(path:string)=>Promise<ArrayBuffer>){
  const plan=buildSilkPlan(props.settings);
  const manifest=JSON.parse(new TextDecoder().decode(await read(silkAssetPath(props.audioDirectory,'manifest.json')))) as SilkExportManifest;
  assertSilkExportIdentity(manifest,plan,mixIdentity(props.mix));
  assertSilkHeadroom(Object.fromEntries(SILK_BUSES.map(bus=>[bus,manifest.files[`${bus}.wav`]?.peak])) as SilkPeaks,props.mix);
  const file=manifest.files[manifest.currentMix];
  if(!file||manifest.sampleRate!==SAMPLE_RATE||manifest.frameDuration!==plan.frameDuration)throw new Error('Silk export manifest format mismatch; regenerate current-settings assets.');
  const audioPath=silkAssetPath(props.audioDirectory,manifest.currentMix),bytes=await read(audioPath);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(hash!==file.sha256)throw new Error('Silk export audio SHA-256 mismatch; refusing stale/corrupt WAV.');
  const samples=Math.round(plan.frameDuration*SAMPLE_RATE),view=new DataView(bytes);
  if(bytes.byteLength!==44+samples*8||file.samples!==samples||view.getUint16(20,true)!==3||view.getUint16(22,true)!==2||view.getUint32(24,true)!==SAMPLE_RATE)throw new Error('Silk export WAV length/format mismatch.');
  return {audioPath,frames:Math.round(plan.frameDuration*30),sha256:hash};
}
