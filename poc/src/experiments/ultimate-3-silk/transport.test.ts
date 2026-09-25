import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SilkTransport} from './transport';
import {DEFAULT_SILK_MIX,SILK_BUSES,type SilkStems} from './types';
const stems=()=>Object.fromEntries(SILK_BUSES.map(bus=>[bus,[new Float32Array(480000),new Float32Array(480000)]])) as unknown as SilkStems;
function fixture(){
 let clock=0,finish=()=>{};
 const starts:Array<{offset:number}>=[],stops:number[]=[],gains:number[]=[];let copies=0,closed=0;
 const context={state:'suspended',currentTime:0,destination:{},resume:()=>new Promise<void>(resolve=>{finish=()=>{context.state='running';resolve();};}),close:async()=>{closed++;context.state='closed';},
 createBuffer:()=>{copies++;return {copyToChannel:()=>{}};},createGain:()=>({gain:{setValueAtTime:(value:number)=>gains.push(value)},connect:()=>{},disconnect:()=>{}}),
 createBufferSource:()=>({buffer:null,onended:null,connect:()=>{},disconnect:()=>{},start:(_:number,offset:number)=>starts.push({offset}),stop:()=>stops.push(1)})};
 const transport=new SilkTransport(()=>context as unknown as AudioContext,()=>clock);
 return {transport,context,starts,stops,gains,finish:()=>finish(),tick:(time:number)=>{clock=time;context.currentTime=time;},copies:()=>copies,closed:()=>closed};
}
test('six shared buffers once per build; gains and ordinary ticks never recopy/restart',async()=>{
 const f=fixture();f.transport.setStems(stems());f.transport.update(2,true);const p=f.transport.enable();f.finish();await p;
 assert.equal(f.starts.length,6);assert.equal(f.copies(),6);assert.equal(f.starts[0].offset,2.015);
 for(let i=1;i<20;i++){f.tick(i/30);f.transport.update(2+i/30,true);f.transport.setMix({...DEFAULT_SILK_MIX,music:i/20});}
 assert.equal(f.starts.length,6);assert.equal(f.copies(),6);
 f.transport.update(3,false);assert.equal(f.stops.length,6);assert.equal(f.transport.activeSources,0);
 f.transport.seek(5,true);assert.equal(f.starts.length,12);assert.equal(f.starts.at(-1)!.offset,5.015);assert.equal(f.copies(),6);
 f.transport.invalidate();assert.equal(f.transport.bufferCopies,0);assert.equal(f.transport.activeSources,0);f.transport.dispose();assert.equal(f.closed(),1);
});
test('pause, seek, retime, disable and unmount invalidate delayed unlock completions',async()=>{
 for(const action of ['pause','seek','retime','disable','unmount']){
  const f=fixture();f.transport.setStems(stems());f.transport.update(1,true);const p=f.transport.enable();
  if(action==='pause')f.transport.update(1,false);if(action==='seek')f.transport.seek(1.01,false);if(action==='retime')f.transport.invalidate();if(action==='disable')f.transport.disable();if(action==='unmount')f.transport.dispose();
  f.finish();await p;assert.equal(f.starts.length,0,action);f.transport.dispose();
 }
});
test('build completion starts latest playhead, never launch snapshot; disabled builds allocate no AudioBuffers',async()=>{
 const f=fixture();f.transport.update(1,true);f.transport.setStems(stems());assert.equal(f.copies(),0);
 const p=f.transport.enable();f.finish();await p;f.transport.invalidate();f.transport.update(4,false);f.transport.setStems(stems());assert.equal(f.transport.activeSources,0);
 f.transport.update(7,true);assert.equal(f.starts.at(-1)!.offset,7.015);assert.equal(f.copies(),12);f.transport.dispose();
});
test('integrated update path resyncs a playing +40ms seek; original anchor survives tick jitter',async()=>{
 const f=fixture();f.transport.setStems(stems());f.transport.update(1,true);const p=f.transport.enable();f.finish();await p;
 for(let i=1;i<=60;i++){f.tick(i/60);f.transport.update(1+i/60+(i%2?.018:-.018),true);}
 assert.equal(f.starts.length,6,'bounded RAF jitter must not churn');
 for(let i=61;i<=180;i++){f.tick(i/60);f.transport.update(1+i/60+.04,true);}
 assert.equal(f.starts.length,12,'exactly one six-source replacement for persistent 40ms seek');assert.equal(f.stops.length,6);
 assert.ok(Math.abs(f.starts.at(-1)!.offset-(1+63/60+.04+.015))<1e-8);f.transport.dispose();
});
test('headroom fails closed on gain edits and new stems; requested mix recovers without recopy',async()=>{
 const f=fixture(),make=()=>{const s=stems();s.agent[0][100]=.3;return s;};
 f.transport.setStems(make());f.transport.update(1,true);const p=f.transport.enable();f.finish();await p;
 const invalid={...DEFAULT_SILK_MIX,master:2,agent:2},previousGains=[...f.gains];f.transport.setMix(invalid);
 assert.deepEqual(f.gains,previousGains,'unsafe gains must never reach GainNodes');
 assert.match(f.transport.headroomError!,/conservative headroom/);assert.equal(f.transport.activeSources,0);
 f.transport.setStems(make());assert.equal(f.transport.activeSources,0);assert.equal(f.transport.bufferCopies,0);
 f.transport.setMix({...DEFAULT_SILK_MIX});assert.equal(f.transport.headroomError,null);assert.equal(f.transport.activeSources,6);
 const copies=f.copies();f.transport.setMix(invalid);f.transport.setMix({...DEFAULT_SILK_MIX});assert.equal(f.copies(),copies);f.transport.dispose();
});
