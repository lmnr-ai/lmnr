import assert from 'node:assert/strict';
import test from 'node:test';
import {DialStore, type DialValue} from 'dialkit';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {installMicro20AuthoringCompatibility} from '../micro-20/authoring';
import {MICRO_22_KEYS, MICRO_22_TIMELINE_ID, MICRO_22_TIMING, micro22Endpoint} from './timeline';
import {micro22TimelineState, micro22PostludeOffset} from './authoring';
const fresh=()=>new (DialStore.constructor as new()=>typeof DialStore)();
test('prelude-only edits ripple, while complete schedules and preset switches retain supplied starts',()=>{
  const previous={start:13.7,starts:[14.85,17.96],presetId:null};
  assert.equal(micro22PostludeOffset({...previous,start:15.7},previous),13.7);
  const supplied={start:15.7,starts:[16.85,19.96],presetId:null};
  assert.equal(micro22PostludeOffset(supplied,previous),15.7);
  assert.equal(supplied.start+(supplied.starts[1]-micro22PostludeOffset(supplied,previous)),19.96);
  assert.equal(micro22PostludeOffset({...previous,start:15.7,presetId:'saved'},previous),15.7);
  assert.equal(micro22PostludeOffset({...previous,start:12.7,starts:[13.85,16.96]},previous),12.7);
  assert.equal(micro22PostludeOffset({...supplied,start:17.7},supplied),15.7);
});
test('source22 panels isolate retained source20 state and preserve active/base/preset curves through remount',()=>{
  for(const id of [MICRO_22_TIMELINE_ID,'ultimate3-voiceover-issues-v4-source22']) {
    const store=fresh(), config=parseTimelineConfig(MICRO_22_TIMING).dialConfig;
    installMicro20AuthoringCompatibility(store,undefined,true,id,MICRO_22_KEYS.map(key=>`${key}.transition`));
    store.registerPanel('ultimate3-voiceover-issues-v4','Legacy',config);
    store.updateValue('ultimate3-voiceover-issues-v4','labels.at',99);
    store.registerPanel(id,'Report',config);
    const spring:DialValue={type:'spring',stiffness:120,damping:14,mass:1};
    const easing:DialValue={type:'easing',duration:.8,ease:[.1,0,.9,1]};
    store.updateValue(id,'labels.transition',spring);store.updateValue(id,'labels.from.progress',.2);
    const preset=store.savePreset(id,'Spring');
    store.clearActivePreset(id);store.updateValue(id,'labels.transition',easing);
    store.updatePanel(id,'Report',config);
    assert.deepEqual(store.getValue(id,'labels.transition'),easing);
    store.loadPreset(id,preset);store.updatePanel(id,'Report',config);
    assert.deepEqual(store.getValue(id,'labels.transition'),spring);
    assert.equal(store.getValue(id,'labels.from.progress'),.2);
    assert.equal(store.getValue('ultimate3-voiceover-issues-v4','labels.at'),99);
    assert.equal(store.getValue(id,'labels.at'),5.5);
  }
});
test('advanced physics spring extraction preserves authored duration and endpoint, but uses resolved live progress',()=>{
  const transition={type:'spring' as const,stiffness:120,damping:14,mass:1};
  const timing={...MICRO_22_TIMING,labels:{...MICRO_22_TIMING.labels,duration:20,transition}};
  const flat={'labels.duration':20,'labels.transition':transition};
  const time=5.8;
  const timeline=Object.fromEntries(computeStaticTimeline(parseTimelineConfig(timing),flat).clips.map(clip=>[clip.key,computeClipState(clip,time,time)]));
  assert.ok(Number(timeline.labels.duration)<1,'DialKit must resolve the spring shorter than its authored duration');
  const state=micro22TimelineState(timeline,0,'',flat);
  assert.deepEqual(state.timing,timing);
  assert.equal(micro22Endpoint(state.timing),32.5);
  assert.deepEqual({progress:state.progress.labels},timeline.labels.current);
  for(const duration of [undefined,NaN,Infinity,'20']) {
    const fallback=micro22TimelineState(timeline,0,'',{'labels.duration':duration,'labels.transition':transition});
    assert.equal(fallback.timing.labels.duration,timeline.labels.duration);
  }
});
test('serialized state retains raw authored curve metadata rather than DialKit resolved duration',()=>{
  const transition={type:'spring' as const,bounce:.3,visualDuration:1};
  const state=micro22TimelineState({labels:{...MICRO_22_TIMING.labels,duration:1.2,transition:{...transition,visualDuration:1.2},current:{progress:.42}}},0,'',{'labels.transition':transition});
  assert.deepEqual(state.timing.labels.transition,transition);assert.equal(state.progress.labels,.42);
});
