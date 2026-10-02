import {loadSilkPianoAssets} from './assets';
import {buildSilkPlan,renderSilkPCMAsync} from './render';
import {SILK_BUSES} from './types';
import type {Ultimate3Settings} from '../micro-18/settings';
// Dedicated worker keeps timeline/PCM compilation off the authoring thread.
self.onmessage=async(event:MessageEvent<{settings:Ultimate3Settings}>)=>{
  try{
    const plan=buildSilkPlan(event.data.settings),assets=await loadSilkPianoAssets(),stems=await renderSilkPCMAsync(plan,assets);
    const transfer= SILK_BUSES.flatMap(bus=>stems[bus].map(ch=>ch.buffer as ArrayBuffer));
    self.postMessage({plan,stems},{transfer});
  }catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
