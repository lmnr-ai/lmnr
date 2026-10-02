import test from 'node:test';
import assert from 'node:assert/strict';
import {ULTIMATE_3_DEFAULTS,normalizeSettings} from '../micro-18/settings';
import {sampleMicro16} from '../micro-16/sample';
import {sampleMicro17} from '../micro-17/sample';
import {worldState,agentScreenPan} from '../micro-17/geometry';
import {sampleFlow} from '../micro-18/sample';
import {introducingFlowState} from '../introducing-flow-1/geometry';
import {compileMotionSamplers,buildSilkMotions} from './motion';
const close=(x:number,y:number)=>assert.ok(Math.abs(x-y)<1e-7,`${x} != ${y}`);
const clone=()=>structuredClone(ULTIMATE_3_DEFAULTS);
test('compiled actual motion clocks equal source samplers, including Bash overlap/gap and depletion',()=>{
  for(const mode of ['default','overlap','gap'] as const){
    const raw=clone();if(mode==='overlap')raw.cost.timing.bashDescent.at=5.7;if(mode==='gap')raw.cost.timing.bashDescent.at=7;
    const s=normalizeSettings(raw),a=compileMotionSamplers(s);
    for(const t of [0,.1,1.4,1.55,1.8,1.97,2.65,5.5,6.2,6.34,6.38,7.1,8.5,9.7,10.5,11.5,12.9,13.67,14.5]){
      const original=sampleMicro16(t,s.cost.controls,s.cost.timing),actual=a.cost(t);
      original.cheapAgents.forEach((p,i)=>close(actual.cheap[i].turns,p.angle/360));
      close(actual.bash.turns,original.bashAgent.angle/360);close(actual.budget.turns,original.budgetAgent.angle/360);
      close(actual.bash.pan,Math.max(-1,Math.min(1,(original.bashAgent.x-original.camera.x-640)/640)));
    }
  }
});
test('U2 unwrapped phase, translation and real camera pan follow source',()=>{
  const s=normalizeSettings(clone()),a=compileMotionSamplers(s);
  for(const t of [.2,.5,2,4.7,5.8,7.4,9.8,10.6,11.5]){
    const original=worldState(sampleMicro17(t,s.ultimate2.timing),s.ultimate2.controls),actual=a.u2(t);
    close(actual.turns,t*s.ultimate2.controls.loaderSpeed);close(actual.distance,original.distance);close(actual.pan,agentScreenPan(original));
  }
});
test('Flow clocks outlive bars; period edits and zero period retain source phase, safe finite gain',()=>{
  for(const period of [0,.41,1.7]){
    const raw=clone();raw.flow.timing.coverSpinner.duration=period;const s=normalizeSettings(raw),a=compileMotionSamplers(s);
    for(const t of [9.4,10.2,11.7]){
      const f=sampleFlow(t+s.flow.entrySlide.at+s.flow.entrySlide.duration,s),source=introducingFlowState(f.playback),actual=a.flow(t);
      close(actual.engine.turns,source.spinnerElapsed/3);close(actual.cover.turns,source.coverElapsed/Math.max(period,1e-6));
      assert.ok(Number.isFinite(actual.cover.gain));
    }
  }
});
test('control-lattice interpolation stays within 0.0002 turns of actual integrated budget phase',()=>{
  const s=normalizeSettings(clone()),m=buildSilkMotions(s).find(m=>m.id==='cost-budget')!;
  for(let i=0;i<m.points.length-1;i+=7){const p=m.points[i],q=m.points[i+1],time=(p.time+q.time)/2-s.allocations.ultimate2;const expected=sampleMicro16(time,s.cost.controls,s.cost.timing).budgetAgent.angle/360;assert.ok(Math.abs((p.turns+q.turns)/2-expected)<.0002);}
});
test('cheap 0/9/20 rps and frozen endpoints have exact unwrapped turns',()=>{
  for(const speed of [0,9,20]){const raw=clone();raw.cost.controls.cheapSpinnerSpeed=speed;const s=normalizeSettings(raw),a=compileMotionSamplers(s);close(a.cost(1.6).cheap[0].turns,.2*speed);}
  const raw=clone();raw.allocations.cost=20;raw.allocations.flow=20;const s=normalizeSettings(raw),motions=buildSilkMotions(s);
  const bash=motions.find(m=>m.id==='cost-bash')!;
  const p=bash.points.find(p=>Math.abs(p.time-(s.allocations.ultimate2+6.33))<1e-8)!;
  const q=bash.points.find(p=>Math.abs(p.time-(s.allocations.ultimate2+6.4))<1e-8)!;
  close(p.turns,q.turns);
  const budget=motions.find(m=>m.id==='cost-budget')!;close(budget.points.at(-1)!.turns,budget.points.find(p=>Math.abs(p.time-(s.allocations.ultimate2+13.67))<1e-8)!.turns);
  close(bash.points.at(-1)!.time,s.allocations.ultimate2+s.pacing.costTrimEnd);
});
