import {normalizeSettings,type Ultimate3Settings} from '../micro-18/settings';
import {canonical} from './types';
/** Detail timing and control hooks can publish in the same React commit from one base.
 * Apply only each publication's changed fields to the latest state, not its stale siblings. */
export function mergeSilkAuthoring(current:Ultimate3Settings,base:Ultimate3Settings,next:Ultimate3Settings):Ultimate3Settings{
  const merge=(live:unknown,before:unknown,after:unknown):unknown=>{
    if(canonical(before)===canonical(after))return live;
    if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after)){
      const result={...(live as Record<string,unknown>)};
      for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
        if(!(key in after))delete result[key];
        else result[key]=merge(result[key],(before as Record<string,unknown>)[key],(after as Record<string,unknown>)[key]);
      }
      return result;
    }
    return after;
  };
  return normalizeSettings(merge(current,base,next));
}
