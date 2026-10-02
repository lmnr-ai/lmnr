import test from 'node:test';
import assert from 'node:assert/strict';
import {ULTIMATE_3_DEFAULTS,normalizeSettings} from '../micro-18/settings';
import {chapterSchedule} from '../micro-18/sample';
import {sampleMicro15} from '../micro-15/sample';
import {sampleAgentWindow} from '../micro-15/agent-window';
import {ultimate3SangersMusicPlan} from '../micro-18/ultimate3-music';
import {buildSilkPlan} from './plan';
import {DEFAULT_SILK_MIX,mixIdentity,normalizeSilkMix} from './types';
import {assertSilkExportIdentity} from './render';
const clone=()=>structuredClone(ULTIMATE_3_DEFAULTS);
test('plan resolves normalized current settings, semantic/frame ends, exact music arrangement',()=>{
  const plan=buildSilkPlan(clone());assert.equal(plan.semanticDuration,54.018181818181816);assert.equal(plan.frameDuration,1621/30);
  assert.deepEqual(plan.music,ultimate3SangersMusicPlan(plan.settings));assert.equal(DEFAULT_SILK_MIX.music,0);assert.equal(DEFAULT_SILK_MIX.master,1);
  assert.deepEqual(buildSilkPlan(clone()),plan);
  const mixKey=mixIdentity(DEFAULT_SILK_MIX);assert.doesNotThrow(()=>assertSilkExportIdentity({identity:plan.identity,mixIdentity:mixKey},plan,mixKey));
  assert.throws(()=>assertSilkExportIdentity({identity:'wrong',mixIdentity:mixKey},plan,mixKey),/does not match/);
  assert.throws(()=>assertSilkExportIdentity({identity:plan.identity,mixIdentity:mixKey},plan,mixIdentity({music:1})),/does not match/);
  assert.equal(normalizeSilkMix({music:NaN,master:-1}).master,0);
});
test('retiming ripples cue offsets, zero trims suppress omitted chapters, extended native holds stay silent',()=>{
  const raw=clone();raw.allocations.cost=20;raw.allocations.flow=20;raw.flow.entrySlide.at=2;raw.issues.leadIn.duration=1.5;
  const plan=buildSilkPlan(raw),s=plan.settings,schedule=chapterSchedule(s),fo=schedule[2].start+s.flow.entrySlide.at+s.flow.entrySlide.duration;
  assert.equal(plan.cues.find(c=>c.id==='flow-introduction')!.at,fo);
  assert.ok(plan.motions.filter(m=>m.id.startsWith('flow')).every(m=>m.points.at(-1)!.time===fo+s.pacing.flowTrimEnd));
  assert.notEqual(plan.identity,buildSilkPlan(clone()).identity);
  raw.pacing.costTrimEnd=0;raw.pacing.flowTrimEnd=0;
  const zero=buildSilkPlan(raw);assert.ok(!zero.motions.some(m=>m.id.startsWith('flow')||m.id.startsWith('cost')));assert.ok(!zero.cues.some(c=>c.id==='flow-introduction'||c.id==='cost-bash-open'));
  raw.flow.entrySlide.duration=0;assert.ok(!buildSilkPlan(raw).cues.some(c=>c.id==='flow-camera-bridge'));
});
test('four principal flourishes, no per-row or per-particle sparkle, placeholder silent and tails bounded',()=>{
  const plan=buildSilkPlan(clone()),conclusion=plan.chapterStarts.conclusion,logo=plan.music.logoAt;
  assert.equal(plan.cues.filter(c=>c.principal).length,4);
  assert.ok(plan.cues.every(c=>c.at>=0&&c.duration>0&&c.at+c.duration<=plan.semanticDuration+1e-8));
  assert.ok(!plan.cues.some(c=>c.at<logo&&c.at+c.duration>conclusion));
  assert.deepEqual(plan.cues.filter(c=>c.at>=logo).map(c=>c.id),['logo-warm-landing']);
});
test('Issues seats at actual readiness-gated assembly; typing <=8/sliding second, visible and burst bounded',()=>{
  for(const delayedSend of [false,true]){
    const raw=clone();if(delayedSend)raw.issues.timing={...raw.issues.timing,messageSend:{...raw.issues.timing.messageSend,at:5.7}};
    const plan=buildSilkPlan(raw),s=plan.settings,it=s.issues.timing,io=plan.chapterStarts.issues+s.issues.leadIn.at+s.issues.leadIn.duration;
    const sample=sampleMicro15(0,s.issues.controls,it);
    const assembly=Math.max(...Object.values(sample.clusters).flatMap(c=>[it.coverAppearance,it.triangleScaleOut,it.triangleScaleIn].map(t=>Math.max(c.readyAt,t.at)+t.duration)));
    assert.equal(plan.cues.find(c=>c.id==='issues-assembly-seat')!.at,io+assembly);
    const touches=plan.cues.filter(c=>c.bus==='typing');
    for(const [i,cue] of touches.entries()){
      const native=cue.at-io;assert.ok(sampleAgentWindow(native,it).visible);
      assert.ok(touches.filter(c=>c.at>=cue.at-1e-9&&c.at<cue.at+1-1e-9).length<=8);
      if(i)assert.ok(cue.at-touches[i-1].at>=.125-1e-9);
      const after=native+cue.duration;
      assert.ok(sampleAgentWindow(after-1e-6,it).visible);
    }
  }
});
test('zero-duration semantic gestures do not create impulses and normalized identity is stable',()=>{
  const raw=clone();raw.ultimate2.timing.upwardTurn.duration=0;raw.flow.timing.coverDescent.duration=0;raw.issues.timing={...raw.issues.timing,promptTyping:{...raw.issues.timing.promptTyping,duration:0}};
  const plan=buildSilkPlan(raw);assert.ok(!plan.cues.some(c=>c.id==='u2-turn-color'||c.id==='flow-cover-pair'));
  assert.equal(plan.identity,buildSilkPlan(normalizeSettings(raw)).identity);
});
