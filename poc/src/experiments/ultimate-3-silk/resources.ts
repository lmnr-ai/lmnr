export const MAX_SEMANTIC_SECONDS=120;
export const MAX_PCM_BYTES=384*1024*1024;
/** Conservative aggregate budget, even though rendering scratch and download mixes need not coexist.
 * Six stereo stems (12), two returned stereo mixes (4), rotor/filter/reflection scratch
 * (8 mono arrays), and one stereo float WAV (2). Transferable worker buffers do not copy.
 */
export const PCM_CHANNEL_BUFFERS=Object.freeze({stems:12,returnedMixes:4,scratch:8,wav:2});
export function assertSilkResources(semanticDuration:number,sampleRate=48000,fps=30) {
  if(!Number.isFinite(semanticDuration)||semanticDuration<0||!Number.isFinite(sampleRate)||sampleRate<=0||!Number.isFinite(fps)||fps<=0)throw new Error('Invalid Silk duration/sample-rate/frame calculation');
  const frames=Math.ceil(semanticDuration*fps),samples=Math.round(frames/fps*sampleRate);
  if(!Number.isSafeInteger(frames)||!Number.isSafeInteger(samples))throw new Error('Unsafe Silk frame/sample calculation');
  const channelBuffers=Object.values(PCM_CHANNEL_BUFFERS).reduce((sum,n)=>sum+n,0),estimatedBytes=samples*Float32Array.BYTES_PER_ELEMENT*channelBuffers+44;
  if(!Number.isSafeInteger(estimatedBytes))throw new Error('Unsafe Silk PCM allocation calculation');
  if(semanticDuration>MAX_SEMANTIC_SECONDS||estimatedBytes>MAX_PCM_BYTES)throw new Error(`Silk in-memory render exceeds 120 seconds or 384 MiB (${(estimatedBytes/1024/1024).toFixed(1)} MiB estimated). Authored settings are unchanged. Shorten the film or use a future streaming renderer; no default audio was substituted.`);
  return {frames,samples,frameDuration:frames/fps,estimatedBytes,channelBuffers};
}
