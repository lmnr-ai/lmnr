import test from 'node:test';
import assert from 'node:assert/strict';
import {SilkBuildClient} from './build-client';
import {ULTIMATE_3_DEFAULTS} from '../micro-18/settings';
import {buildSilkPlan} from './plan';
import {SILK_BUSES,type SilkStems} from './types';
import {stereo} from './dsp';
const fake=()=>({postMessage:(_message:unknown)=>{},terminate(){this.terminated=true;},terminated:false,onmessage:null as Worker['onmessage'],onerror:null as Worker['onerror']});
test('rapid retiming terminates/rejects stale work; late messages cannot win; one-build cache and dispose',async()=>{
  const workers:ReturnType<typeof fake>[]=[];const client=new SilkBuildClient(()=>{const w=fake();workers.push(w);return w;});
  const first=client.build(ULTIMATE_3_DEFAULTS),rejected=assert.rejects(first,{name:'AbortError'}),raw=structuredClone(ULTIMATE_3_DEFAULTS);raw.pacing.costTrimEnd=12;
  const second=client.build(raw);assert.ok(workers[0].terminated);await rejected;
  const stems=Object.fromEntries(SILK_BUSES.map(b=>[b,stereo(1)])) as SilkStems;
  const respond=(worker:ReturnType<typeof fake>,settings=raw)=>worker.onmessage?.call(worker as unknown as Worker,{data:{plan:buildSilkPlan(settings),stems}} as MessageEvent);
  respond(workers[0],ULTIMATE_3_DEFAULTS);respond(workers[1]);const value=await second;assert.ok(workers[1].terminated);
  assert.equal(await client.build(raw),value);assert.equal(workers.length,2);
  client.dispose();await assert.rejects(client.build(raw),/disposed/);
});
test('worker errors and settings identity mismatch reject rather than returning default audio',async()=>{
  let worker=fake();const client=new SilkBuildClient(()=>worker=fake());
  let pending=client.build(ULTIMATE_3_DEFAULTS);worker.onmessage?.call(worker as unknown as Worker,{data:{error:'missing assets'}} as MessageEvent);await assert.rejects(pending,/missing assets/);
  pending=client.build(ULTIMATE_3_DEFAULTS);worker.onmessage?.call(worker as unknown as Worker,{data:{plan:{settingsKey:'wrong'}}} as MessageEvent);await assert.rejects(pending,/Stale Silk/);client.dispose();
});
