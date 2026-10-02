import {pcmPeak} from './dsp';
import {SILK_BUSES,normalizeSilkMix,type SilkBus,type SilkMix,type SilkStems} from './types';
export type SilkPeaks=Record<SilkBus,number>;
// Owned PCM is immutable after installation. Cache scans once per generation, never per gain/tick.
const peaksCache=new WeakMap<SilkStems,SilkPeaks>();
export function silkStemPeaks(stems:SilkStems):SilkPeaks {
  let peaks=peaksCache.get(stems);
  if(!peaks){peaks=Object.fromEntries(SILK_BUSES.map(bus=>[bus,pcmPeak(stems[bus])])) as SilkPeaks;peaksCache.set(stems,peaks);}
  return peaks;
}
/** Sum of absolute bus peaks: conservative, NOT an exact mixed peak. No cancellation/temporal
 * separation credit. Reserve 1e-6 for float32 gain/addition rounding across six buses. */
export function assertSilkHeadroom(peaks:SilkPeaks,input:Partial<SilkMix>):number {
  const mix=normalizeSilkMix(input);let bound=0;
  for(const bus of SILK_BUSES){if(!Number.isFinite(peaks[bus])||peaks[bus]<0)throw new Error('Invalid Silk stem peak evidence');bound+=peaks[bus]*mix[bus]*mix.master;}
  if(bound>=1-1e-6)throw new Error('Silk mix exceeds conservative headroom bound; reduce master/bus gains.');
  return bound;
}
