import type {Ultimate3Settings} from '../micro-18/settings';
import {normalizeSettings} from '../micro-18/settings';
import {canonical,type SilkPlan,type SilkStems} from './types';
export type SilkBuild={plan:SilkPlan;stems:SilkStems};
type RenderWorker=Pick<Worker,'postMessage'|'terminate'|'onmessage'|'onerror'>;
/** One retained settings build. Mix-only edits reuse stems; new settings terminate stale work.
 * Caller must stop old playback immediately on invalidate/build, not wait for completion.
 */
export class SilkBuildClient {
  private worker?:RenderWorker;
  private reject?:(reason:Error)=>void;
  private generation=0;
  private cache?:{key:string;value:SilkBuild};
  private disposed=false;
  constructor(private createWorker:()=>RenderWorker=()=>new Worker(new URL('./render.worker.ts',import.meta.url),{type:'module'})){}
  cancel(){this.generation++;this.worker?.terminate();this.worker=undefined;this.reject?.(new DOMException('Superseded Silk build','AbortError'));this.reject=undefined;}
  async build(settings:Ultimate3Settings):Promise<SilkBuild>{
    if(this.disposed)throw new Error('Silk build client disposed');
    this.cancel();const token=this.generation,key=canonical(normalizeSettings(settings));
    if(this.cache?.key===key)return this.cache.value;
    // Drop old large buffers before allocating replacement; no unbounded settings cache.
    this.cache=undefined;
    return new Promise((resolve,reject)=>{
      this.reject=reject;const worker=this.createWorker();this.worker=worker;
      worker.onmessage=(event:MessageEvent<SilkBuild&{error?:string}>)=>{
        if(token!==this.generation||this.disposed)return;
        worker.terminate();this.worker=undefined;this.reject=undefined;
        if(event.data.error){reject(new Error(event.data.error));return;}
        if(event.data.plan.settingsKey!==key){reject(new Error('Stale Silk settings identity'));return;}
        const value={plan:event.data.plan,stems:event.data.stems};this.cache={key,value};resolve(value);
      };
      worker.onerror=()=>{if(token!==this.generation)return;worker.terminate();this.worker=undefined;this.reject=undefined;reject(new Error('Silk render worker failed'));};
      worker.postMessage({settings:normalizeSettings(settings)});
    });
  }
  invalidate(){this.cancel();this.cache=undefined;}
  dispose(){this.invalidate();this.disposed=true;}
}
