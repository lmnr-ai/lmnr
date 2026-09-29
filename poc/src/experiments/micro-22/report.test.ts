import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {sampleIssueOutro} from '../micro-20/outro';
import {sampleMicro20} from '../micro-20/sample';
import {sampleMicro22, reportGeometry, REPORT_EXPLANATION, REPORT_FIELDS} from './sample';
import {Micro22Scene} from './Scene';
import {MICRO_22_TIMING, MICRO_22_KEYS, normalizeMicro22Timing, micro22Endpoint, micro22PreludeEnd} from './timeline';
import {micro22TimelineState} from './authoring';
import {NARRATION, sampleNarration} from './narration';
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const timeline = (time: number, timing = MICRO_22_TIMING) => ({time, ...Object.fromEntries(computeStaticTimeline(parseTimelineConfig(timing), {}).clips.map(clip => [clip.key, computeClipState(clip, time, time)]))});
test('three Figma states keep a single centered report, exact bounds, fields and tail', () => {
  for (const [time, x, y, width, height] of [[4.5,463,283,154,154], [6.5,108,260,497,200], [9,108,152,497,416]]) {
    const s = sampleMicro22(time);
    const {scale, warningScale, rows, explanationWords, ...geometry} = s.report;
    assert.deepEqual(geometry, {x,y,width,height,centerY:360,tailWidth:44,tailHeight:51});
    assert.equal(scale, 1);
    assert.deepEqual(s.world.origin, {x:746,y:360});
    assert.equal(s.world.cameraScale, 1);
    close(s.world.origin.y - (s.world.bashAgent.y - 1261), -1740);
    const markup = renderToStaticMarkup(createElement(Micro22Scene, {sample:s}));
    assert.equal((markup.match(/class="micro22-report"/g) ?? []).length, 1);
    for (const field of REPORT_FIELDS) {assert.ok(markup.includes(field.name)); assert.ok(markup.includes(field.color));}
    assert.ok(markup.includes('data-visible-words'));
    assert.ok(!markup.includes('micro15-composition'));
    assert.ok(!markup.includes('coding agent'));
    assert.ok(!markup.includes('high-level patterns'));
  }
  for (let p=0;p<=1;p+=.025) {
    const r=reportGeometry(p,0), e=reportGeometry(1,p);
    close(r.y+r.height/2,360);close(e.y+e.height/2,360);
    assert.ok(r.x>=108 && r.x+r.width<=617);assert.equal(e.width,497);
  }
});
test('captions follow descent, bubble, stagger and explanation action cues, then original postlude copy', () => {
  assert.deepEqual(Object.values(NARRATION), ['Flow-1 powers Signals, our agent built to analyze traces at scale.', 'It finds deep issues,', 'and reports them.', 'Not just with labels,', 'but with any structure you define,', 'across every trace.', 'and clusters them into high-level patterns,', 'Ready for you or your coding agent.']);
  for (const [caption, action] of [['subtitleDetection','bashDescent'], ['subtitleReporting','bubble'], ['subtitleLabels','labelReveal'], ['subtitleStructure','explanationTyping'], ['subtitleEveryTrace','analysisZoomOut']] as const) {
    close(MICRO_22_TIMING[caption].at, MICRO_22_TIMING[action].at);
    assert.equal(sampleNarration(MICRO_22_TIMING[action].at+.01, MICRO_22_TIMING), caption);
  }
  assert.equal(sampleMicro22(2.5).narration,'subtitleDetection');
  assert.ok(sampleMicro22(2.5).world.descent! > 0 && sampleMicro22(2.5).world.descent! < 2040);
  assert.equal(sampleMicro22(6.2).narration,'subtitleLabels');
  assert.equal(sampleMicro22(9).narration,'subtitleStructure');
  assert.equal(sampleNarration(13.8,MICRO_22_TIMING),'subtitleEveryTrace');
  assert.equal(sampleNarration(15,MICRO_22_TIMING),'subtitlePatterns');
  assert.equal(sampleNarration(18,MICRO_22_TIMING),'subtitleReady');
});
test('forward/reverse and live clip.current are identical with custom endpoints and curves', () => {
  const timing=normalizeMicro22Timing({...MICRO_22_TIMING, labels:{at:5,duration:1.2,from:{progress:.15},to:{progress:.85},transition:{type:'easing',duration:1.2,ease:[.1,0,.8,1]}}});
  const times=[0,1.2,3.4,4.5,5.4,6.5,8,9,11.8,13.7,14.7,15.7];
  const samples=times.map(time=>sampleMicro22(time,{timing}));
  times.slice().reverse().forEach((time,i)=>assert.deepEqual(sampleMicro22(time,{timing}),samples[samples.length-i-1]));
  for(const time of times.filter(t=>t<=13.7)) {
    const state=micro22TimelineState(timeline(time,timing));
    assert.deepEqual(sampleMicro22(time,{timing:state.timing},state.progress),sampleMicro22(time,{timing}));
  }
  const state=micro22TimelineState(timeline(6,timing));state.progress.labels=.31;
  close(sampleMicro22(6,{timing},state.progress).report.width,154+343*.31);
  state.progress.subtitleLabels=.04;close(sampleMicro22(6,{timing},state.progress).subtitleOpacity,.5);
  assert.ok(MICRO_22_KEYS.every(key=>normalizeMicro22Timing({[key]:{at:0,duration:0}})[key].duration>=.05));
  close(micro22Endpoint(),20.7);
});
test('renderer/sampler optional seams preserve Animation20 default behavior and opening grid alignment', () => {
  for(const t of [0,1.5,4,6,8.5,10,14,16]) assert.deepEqual(sampleMicro20(t),sampleMicro20(t,undefined,undefined,undefined,undefined,undefined,true,undefined));
  const old=sampleMicro20(0), next=sampleMicro22(0).world;
  assert.equal(old.phase,'bash');
  assert.deepEqual(next.origin,old.origin);assert.equal(next.cameraScale,old.cameraScale);
  const s=sampleMicro22(micro22PreludeEnd()-1e-8), after=sampleMicro22(micro22PreludeEnd());
  assert.notEqual(s.world.phase,'issues');assert.equal(after.world.phase,'issues');
  assert.deepEqual(s.world.origin,{x:640,y:360});
  assert.equal(s.report.scale,0);assert.equal(s.world.warnings!.filter(w=>w.scale<1).length,0);
});

test('closing field reuses the terminal merged source15 world and arbitrary/reverse seek is deterministic', () => {
  const end=micro22Endpoint(), terminal=sampleMicro22(end);
  assert.equal(terminal.world.phase,'issues');
  if(terminal.world.phase!=='issues') throw Error('missing postlude');
  assert.equal(terminal.world.issue.agent.phase,'exited');
  for(const t of [end+.5,end+2,end+.1,end+1]) {
    const s=sampleMicro22(t);assert.equal(s.world.phase,'issues');
    if(s.world.phase!=='issues') throw Error('missing postlude');
    assert.deepEqual(s.world.outro,sampleIssueOutro(terminal.world.issue,t-end));
  }
  const partial=sampleMicro22(end,{timing:{analysisZoomOut:{...MICRO_22_TIMING.analysisZoomOut,to:{progress:.6}}}});
  assert.notEqual(partial.world.phase,'issues');assert.ok(partial.world.validation);
});
