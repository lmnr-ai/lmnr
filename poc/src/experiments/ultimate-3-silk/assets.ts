import manifest from '../../../public/ultimate-3-silk/piano/manifest.json';
import type {VerifiedPianoPCM} from './types';
export const PIANO_MANIFEST=manifest;
export const ASSET_IDENTITY=manifest.files.map(f=>`${f.midi}:${f.sha256}`).join('|');
export async function verifyPianoAssets(read:(name:string)=>Promise<ArrayBuffer>):Promise<VerifiedPianoPCM> {
  const samples=new Map<number,{pcm:Float32Array;onset:number}>();
  for(const entry of manifest.files){
    const bytes=await read(entry.name);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
    if(digest!==entry.sha256||bytes.byteLength!==entry.samples*4)throw new Error(`Silk piano integrity mismatch: ${entry.name}`);
    const view=new DataView(bytes),pcm=new Float32Array(entry.samples);
    for(let i=0;i<pcm.length;i++){pcm[i]=view.getFloat32(i*4,true);if(!Number.isFinite(pcm[i]))throw new Error('Nonfinite piano PCM');}
    samples.set(entry.midi,{pcm,onset:entry.onset});
  }
  return {assetIdentity:ASSET_IDENTITY,samples};
}
let browserAssets:Promise<VerifiedPianoPCM>|undefined;
export function loadSilkPianoAssets():Promise<VerifiedPianoPCM> {
  return browserAssets??=(verifyPianoAssets(async name=>{
    const response=await fetch(`/ultimate-3-silk/piano/${name}`);
    if(!response.ok)throw new Error(`Missing Silk piano asset: ${name}`);
    return response.arrayBuffer();
  }).catch(error=>{browserAssets=undefined;throw error;}));
}
