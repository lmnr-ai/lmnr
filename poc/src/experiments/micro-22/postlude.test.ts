import assert from 'node:assert/strict';
import test from 'node:test';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {sampleMicro22} from './sample';
import {MICRO_22_TIMING, micro22Endpoint, micro22PreludeEnd, micro22DurationFrames, normalizeMicro22IssueTiming} from './timeline';
import {micro22TimelineConfig, micro22PostludeState, micro22TimelineState} from './authoring';
import {ISSUE_KEYS, clipEnd} from '../micro-20/timeline';
import {mapIssuePoint} from '../micro-20/geometry';
import {upgradeStoredMicro22Captions, migrateMicro22CaptionStorage} from './persistence';
import {MICRO_22_TIMELINE_ID} from './timeline';
import {VOICEOVER_DEFAULTS, normalizeVoiceoverSettings, readVoiceoverSettings} from '../micro-18/voiceover-cut';
import {issueEndpoint, issueEntryEnd, issuePostludeOffset, normalizeSettings} from '../micro-18/settings';
import {chapterSchedule, sampleIssues, ultimate3DurationFrames} from '../micro-18/sample';
import {issuesTimelineConfig, issuesTimelineValues, settingsFromIssuesTimeline} from '../micro-18/authoring';
import {ultimate3AgentWindowSoundTiming} from '../micro-18/sound';
import {ultimate3TypingWindows} from '../micro-18/typing-audio';
const close = (a: number, b: number) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);
const numeric = (value: unknown) => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'number' ? Math.round(v * 1e8) / 1e8 : v));
const stateAt = (config: any, time: number, flat = {}): any => ({time, ...Object.fromEntries(computeStaticTimeline(parseTimelineConfig(config),flat).clips.map(c=>[c.key,computeClipState(c,time,time)]))});
test('completed trace field hands off continuously to shared source15 occupants and seeks reversibly through CLI/exit',()=>{
  const start=micro22PreludeEnd(), before=sampleMicro22(start-1e-9).world, after=sampleMicro22(start).world;
  assert.notEqual(before.phase,'issues');assert.equal(after.phase,'issues');
  if(before.phase==='issues'||after.phase!=='issues') throw Error('invalid seam');
  for(const warning of before.warnings) {
    const token=after.issue.tokens.find(t=>t.token.id===warning.id)!;
    const point=mapIssuePoint(token);close(warning.x,point.x);close(warning.y,point.y);close(warning.scale,after.issue.warningAppearance[warning.id]);
  }
  for(const local of [0,1.5,3.5,4.5,5.3,5.8,7]) {
    const t=start+local, expected=sampleMicro22(t);sampleMicro22(start+7);
    assert.deepEqual(sampleMicro22(t),expected);
    assert.equal(expected.world.phase,'issues');
  }
  const cli=sampleMicro22(start+6).world;
  assert.equal(cli.phase,'issues');if(cli.phase!=='issues') throw Error('missing agent');
  assert.equal(cli.issue.agent.command,'lmnr-cli sql query');assert.ok(cli.issue.agent.visible);
  const exit=sampleMicro22(micro22Endpoint()).world;
  assert.equal(exit.phase,'issues');if(exit.phase==='issues') assert.equal(exit.issue.agent.phase,'exited');
});
test('standalone postlude bars preserve endpoints/curves/raw duration and consume real DialKit current',()=>{
  const issueTiming=normalizeMicro22IssueTiming({agentWindowEnter:{at:4.26,duration:.8,from:{progress:.1},to:{progress:.8},transition:{type:'easing',duration:.8,ease:[.2,0,.8,1]}}});
  close(sampleMicro22(12,{}, {subtitleEveryTrace:.04}).subtitleOpacity,.5);
  const time=micro22PreludeEnd()+4.6, config=micro22TimelineConfig(MICRO_22_TIMING,issueTiming);
  const values=Object.fromEntries(ISSUE_KEYS.flatMap(key=>[[`postlude_${key}.duration`,issueTiming[key].duration],...issueTiming[key].transition ? [[`postlude_${key}.transition`,issueTiming[key].transition]] : []]));
  const timeline=stateAt(config,time,values), post=micro22PostludeState(timeline,micro22PreludeEnd(),values);
  assert.deepEqual(numeric(post.issueTiming),numeric(issueTiming));
  const live=sampleMicro22(time,{issueTiming},undefined,undefined,post.progress);
  assert.deepEqual(numeric(live),numeric(sampleMicro22(time,{issueTiming})));
  post.progress.agentWindowEnter=.25;
  const changed=sampleMicro22(time,{issueTiming},undefined,undefined,post.progress).world;
  assert.equal(changed.phase,'issues');if(changed.phase==='issues') close(changed.issue.agent.translateY,604*(.25-1));
  const raw=normalizeMicro22IssueTiming({promptTyping:{at:4.27,duration:20,transition:{type:'spring',stiffness:120,damping:14,mass:1}}});
  const flat={'postlude_promptTyping.duration':20,'postlude_promptTyping.transition':raw.promptTyping.transition};
  const resolved=stateAt(micro22TimelineConfig(MICRO_22_TIMING,raw),time,flat);
  assert.deepEqual(numeric(micro22PostludeState(resolved,micro22PreludeEnd(),flat).issueTiming.promptTyping),numeric(raw.promptTyping));
  assert.ok(micro22Endpoint(undefined,raw)>=micro22PreludeEnd()+24.27);
  for(const key of ISSUE_KEYS) assert.equal(normalizeMicro22IssueTiming({[key]:{at:0,duration:0}})[key].duration,.05);
});
test('authored dependency spring tails extend the full endpoint and do not truncate cluster/CLI tracks',()=>{
  const timing=normalizeMicro22IssueTiming({coverAppearance:{at:0,duration:.1,transition:{type:'spring',visualDuration:8,bounce:.2}}, messageSend:{at:6,duration:2,transition:{type:'spring',visualDuration:4,bounce:.2}}});
  const end=micro22Endpoint(undefined,timing), world=sampleMicro22(end,{issueTiming:timing}).world;
  assert.ok(end>micro22PreludeEnd()+clipEnd(timing.messageSend));
  assert.equal(world.phase,'issues');if(world.phase!=='issues') throw Error('missing postlude');
  assert.ok(Object.values(world.issue.clusters).every(c=>c.clusterBackgroundOpacity===1));
  assert.equal(world.issue.agent.command,'lmnr-cli sql query');
});
test('Ultimate3 full endpoint/offsets extend only Issues and conclusion; integrated live extraction and dependency ripple',()=>{
  const s=VOICEOVER_DEFAULTS, schedule=chapterSchedule(s);
  schedule.map(c=>c.start).forEach((start,i)=>close(start,[0,21.16,34.86,50.052,69.36][i]));
  // The voice cut's report prelude ends 2.692s sooner (FLOW_HOLD) than source22's 13.7s.
  close(issueEntryEnd(s),.9);close(issuePostludeOffset(s),12.908);close(issueEndpoint(s),18.408);close(s.allocations.issues,19.308);
  assert.equal(ultimate3DurationFrames(s),2278);assert.equal(micro22DurationFrames(),683);
  const time=15.8, flat=issuesTimelineValues(s), timeline=stateAt(issuesTimelineConfig(s),time,flat);
  const next=settingsFromIssuesTimeline(timeline,s,flat);assert.deepEqual(next,s);
  const report=micro22TimelineState(timeline,issueEntryEnd(s),'report_',flat), post=micro22PostludeState(timeline,issuePostludeOffset(s),flat);
  assert.deepEqual(numeric(sampleIssues(time,s,report.progress,post.progress)),numeric(sampleIssues(time,s)));
  timeline.report_analysisLayout={...timeline.report_analysisLayout,at:timeline.report_analysisLayout.at+2};
  const shifted=settingsFromIssuesTimeline(timeline,s,flat);
  close(issuePostludeOffset(shifted),issuePostludeOffset(s)+2);assert.deepEqual(shifted.issues.timing,s.issues.timing);
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(shifted))),shifted);
  const window=ultimate3AgentWindowSoundTiming(s)!;
  close(window.down.at,schedule[3].start+issuePostludeOffset(s)+s.issues.timing.agentWindowEnter.at);
  assert.ok(ultimate3TypingWindows(s).every(w=>w.start>=schedule[3].start+issuePostludeOffset(s)));
});
test('exact generated old caption defaults migrate only on load; custom and normalized imports stay literal',()=>{
  const old=(at:number,duration:number)=>({at,duration,from:{progress:0},to:{progress:1},transition:{type:'easing' as const,duration,ease:[.45,0,.55,1] as [number,number,number,number]}});
  const oldTiming={subtitleFlow:old(0,3.8),subtitleDetection:old(3.8,1.7),subtitleLabels:old(5.5,2),subtitleStructure:old(7.5,3.8)};
  const original=structuredClone(oldTiming), corrected=upgradeStoredMicro22Captions(oldTiming)!;
  assert.deepEqual(oldTiming,original);
  const c=oldTiming.subtitleDetection;
  assert.deepEqual(upgradeStoredMicro22Captions({subtitleDetection:{at:c.at,duration:c.duration,transition:c.transition,from:c.from,to:c.to}})!.subtitleDetection,MICRO_22_TIMING.subtitleDetection);
  for(const key of Object.keys(oldTiming) as (keyof typeof oldTiming)[]) assert.deepEqual(corrected[key],MICRO_22_TIMING[key]);
  const custom={...oldTiming,subtitleLabels:old(6,2)};assert.deepEqual(upgradeStoredMicro22Captions(custom)!.subtitleLabels,custom.subtitleLabels);
  const raw={...VOICEOVER_DEFAULTS,issues:{...VOICEOVER_DEFAULTS.issues,timing22:oldTiming}};
  assert.deepEqual(readVoiceoverSettings({getItem:()=>JSON.stringify(raw)}).issues.timing22!.subtitleDetection,MICRO_22_TIMING.subtitleDetection);
  const imported=normalizeVoiceoverSettings(raw);
  assert.deepEqual(readVoiceoverSettings({getItem:()=>JSON.stringify(imported)}).issues.timing22!.subtitleDetection,oldTiming.subtitleDetection);
  const values=Object.fromEntries(Object.entries(oldTiming).flatMap(([key,c])=>[[`${key}.at`,c.at],[`${key}.duration`,c.duration],[`${key}.from.progress`,0],[`${key}.to.progress`,1],[`${key}.transition`,c.transition]]));
  const key=`dialkit:${MICRO_22_TIMELINE_ID}`, saved=JSON.stringify({version:1,values,baseValues:values,presets:[{id:'custom',values:{...values,'subtitleLabels.at':6}}]});
  const data=new Map([[key,saved]]), storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
  migrateMicro22CaptionStorage(storage);const result=JSON.parse(data.get(key)!);
  assert.equal(result.values['subtitleDetection.at'],1.6);assert.equal(result.presets[0].values['subtitleLabels.at'],6);
  assert.equal(data.get('micro22:action-captions-v1:original'),saved);
  const snapshot=JSON.stringify([...data]);migrateMicro22CaptionStorage(storage);assert.equal(JSON.stringify([...data]),snapshot);
});
