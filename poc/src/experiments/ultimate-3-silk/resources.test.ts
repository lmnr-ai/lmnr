import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSilkResources,MAX_PCM_BYTES,PCM_CHANNEL_BUFFERS} from './resources';
test('resource estimates use actual sample rate/channel counts and safe frame rounding without allocating',()=>{
  const budget=assertSilkResources(54.018181818181816);
  assert.equal(budget.samples,2593600);assert.equal(budget.channelBuffers,26);
  assert.equal(budget.estimatedBytes,269734444);assert.equal(PCM_CHANNEL_BUFFERS.stems,12);
  const samplesPerFrame=48000/30,bytesPerFrame=samplesPerFrame*4*26;
  const lastFrame=Math.floor((MAX_PCM_BYTES-44)/bytesPerFrame);
  assert.doesNotThrow(()=>assertSilkResources(lastFrame/30));
  assert.throws(()=>assertSilkResources((lastFrame+1)/30),/384 MiB/);
  assert.throws(()=>assertSilkResources(121,8000),/120 seconds/);
  assert.throws(()=>assertSilkResources(54,192000),/384 MiB/);
  for(const value of [NaN,Infinity,-1])assert.throws(()=>assertSilkResources(value),/Invalid/);
  assert.throws(()=>assertSilkResources(Number.MAX_VALUE),/Unsafe/);
});
