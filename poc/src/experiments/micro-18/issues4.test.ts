import {ultimate3TypingWindows} from './typing-audio';
import {ultimate3AgentWindowSoundTiming} from './sound';
import {ultimate3ScoreCues} from './score/cues';
import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import historical from '../../../handoff/voiceover-retime/retimed-settings.json';
import {VOICEOVER_DEFAULTS as s, normalizeVoiceoverSettings, migrateStoredVoiceoverIssues22, readVoiceoverSettings} from './voiceover-cut';
import {ULTIMATE_3_DEFAULTS, normalizeSettings, issueEntryEnd, issueEndpoint} from './settings';
import {chapterSchedule, sampleUltimate3, sampleIssues} from './sample';
import {issuesTimelineConfig, issuesTimelineKeys, issuesTimelineValues, settingsFromIssuesTimeline} from './authoring';
import {micro22TimelineState} from '../micro-22/authoring';
import {sampleMicro22} from '../micro-22/sample';
import {MICRO_22_TIMING} from '../micro-22/timeline';
import {Ultimate3Scene} from './Scene';
import {flowIssuesCamera, issueSurfacePlacement, projectScreenRect} from './transitions';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('only current v4 upgrades; source20 stays available; restored postlude extends only Issues/conclusion',()=>{
  assert.equal(s.issues.sourceVersion,22);assert.equal(ULTIMATE_3_DEFAULTS.issues.sourceVersion,20);
  assert.equal(normalizeSettings(historical).issues.sourceVersion,20);
  const imported=normalizeVoiceoverSettings(historical);
  assert.equal(readVoiceoverSettings({getItem:()=>JSON.stringify(imported)}).issues.sourceVersion,20);
  const previous=structuredClone(s);previous.issues.sourceVersion=20;delete previous.issues.migration22;delete previous.issues.timing22;delete previous.issues.controls22;
  const original=structuredClone(previous);
  const next=migrateStoredVoiceoverIssues22(previous) as typeof s;
  assert.deepEqual(previous,original);assert.equal(next.issues.sourceVersion,22);
  assert.deepEqual(migrateStoredVoiceoverIssues22(next),next);
  for(const key of ['allocations','pacing','ultimate2','cost','flow','conclusion','clouds','voiceover'] as const) assert.deepEqual(next[key],previous[key]);
  for(const key of ['timing','controls','preludeTiming','preludeControls','issueStart','leadIn'] as const) assert.deepEqual(next.issues[key],previous.issues[key]);
  close(chapterSchedule(s)[4].start,70.61);
  assert.ok(issueEntryEnd(s)+issueEndpoint(s)<=s.allocations.issues);
});
test('all new timing fields, endpoints, curves and controls round-trip independently from source20',()=>{
  const custom=normalizeSettings({...s,issues:{...s.issues,controls22:{spinnerSpeed:3},timing22:{...MICRO_22_TIMING,labels:{at:5,duration:1.2,from:{progress:.2},to:{progress:.9},transition:{type:'spring',bounce:.3,visualDuration:1}}}}});
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(custom))),custom);
  const config=issuesTimelineConfig(custom), time=6.5;
  const timeline={time,...Object.fromEntries(computeStaticTimeline(parseTimelineConfig(config),{}).clips.map(clip=>[clip.key,computeClipState(clip,time,time)]))};
  assert.deepEqual(settingsFromIssuesTimeline(timeline,custom,issuesTimelineValues(custom)),custom);
  assert.ok(issuesTimelineKeys(custom).includes('report_explanation'));
  assert.ok(issuesTimelineKeys(custom).includes('postlude_cliCommandTyping'));
  const state=micro22TimelineState(timeline,issueEntryEnd(custom),'report_',issuesTimelineValues(custom));
  assert.deepEqual(sampleIssues(time,custom,state.progress).source22,sampleMicro22(time-issueEntryEnd(custom),{timing:custom.issues.timing22,controls:custom.issues.controls22,issueTiming:custom.issues.timing,issueControls:custom.issues.controls}));
  const switched=normalizeSettings({...custom,issues:{...custom.issues,sourceVersion:20}});
  assert.deepEqual(switched.issues.timing22,custom.issues.timing22);assert.deepEqual(switched.issues.timing,s.issues.timing);
});
test('source22 imported advanced physics spring durations survive Issues detail extraction and JSON export',()=>{
  const transition={type:'spring' as const,stiffness:120,damping:14,mass:1};
  const imported=normalizeVoiceoverSettings(JSON.parse(JSON.stringify({...s,issues:{...s.issues,
    timing22:{...MICRO_22_TIMING,labels:{...MICRO_22_TIMING.labels,duration:20,transition}},
  }})));
  const before=JSON.stringify(imported);
  const time=issueEntryEnd(imported)+5.8, flat=issuesTimelineValues(imported);
  const clips=Object.fromEntries(computeStaticTimeline(parseTimelineConfig(issuesTimelineConfig(imported)),flat).clips.map(clip=>[clip.key,computeClipState(clip,time,time)]));
  const timeline={time,...clips};
  assert.ok(Number(clips.report_labels.duration)<1);
  const extracted=settingsFromIssuesTimeline(timeline,imported,flat);
  assert.equal(JSON.stringify(extracted),before);
  const exported=normalizeVoiceoverSettings(JSON.parse(JSON.stringify(extracted)));
  assert.deepEqual(exported,imported);
  assert.equal(issueEndpoint(exported),31.9);
  const state=micro22TimelineState(timeline,issueEntryEnd(extracted),'report_',flat);
  assert.deepEqual(state.timing.labels,imported.issues.timing22!.labels);
  assert.deepEqual(sampleIssues(time,extracted,state.progress).source22,sampleMicro22(time-issueEntryEnd(imported),{timing:imported.issues.timing22,controls:imported.issues.controls22,issueTiming:imported.issues.timing,issueControls:imported.issues.controls}));
});
test('source22 entry spring also preserves raw authored duration through detail extraction',()=>{
  const transition={type:'spring' as const,stiffness:120,damping:14,mass:1};
  const imported=normalizeVoiceoverSettings({...s,issues:{...s.issues,leadIn:{...s.issues.leadIn,duration:2,transition}}});
  const flat=issuesTimelineValues(imported), time=3;
  const clips=Object.fromEntries(computeStaticTimeline(parseTimelineConfig(issuesTimelineConfig(imported)),flat).clips.map(clip=>[clip.key,computeClipState(clip,time,time)]));
  const timeline={time,...clips};
  assert.ok(Number(clips.leadIn.duration)<1);
  assert.deepEqual(settingsFromIssuesTimeline(timeline,imported,flat),imported);
});
test('entry, report, restored postlude and conclusion preserve one source22 world',()=>{
  const start=chapterSchedule(s)[3].start, end=chapterSchedule(s)[4].start;
  for(const t of [0,.45,.9,5.4,7.4,9.9]) {
    const sample=sampleUltimate3(start+t,s);
    const markup=renderToStaticMarkup(createElement(Ultimate3Scene,{sample,settings:s}));
    assert.equal((markup.match(/data-source-version="22"/g)??[]).length,1);
    assert.ok(!markup.includes('micro15-composition'));assert.ok(!markup.includes('high-level patterns'));
    assert.equal(sample.issues?.postludeActive,false);
  }
  const terminal=sampleUltimate3(end-1e-7,s).issues!.source22!;
  const conclusion=sampleUltimate3(end,s).conclusionSource22!;
  assert.equal(conclusion.world.phase,'issues');assert.equal(terminal.world.phase,'issues');
  if(conclusion.world.phase!=='issues'||terminal.world.phase!=='issues') throw Error('missing issues');
  assert.deepEqual(conclusion.world.issue.tokens,terminal.world.issue.tokens);assert.deepEqual(conclusion.world.issue.agent,terminal.world.issue.agent);assert.deepEqual(conclusion.world.issue.clusters,terminal.world.issue.clusters);assert.equal(conclusion.world.outro?.scale,1);
  for(const local of [13.8,16.8,18.8]) {
    const sample=sampleUltimate3(start+local,s);
    const markup=renderToStaticMarkup(createElement(Ultimate3Scene,{sample,settings:s}));
    assert.ok(markup.includes('micro15-composition'));assert.equal(sample.issues?.postludeActive,true);
  }
  const times=[end+.001,end+.5,end+2,end+3.7];
  const samples=times.map(time=>sampleUltimate3(time,s));
  times.slice().reverse().forEach((time,i)=>assert.deepEqual(sampleUltimate3(time,s),samples[samples.length-1-i]));
  for(const outgoing of [{x:-700,y:-5500,scale:1},{x:-4000,y:-8000,scale:.67}]) {
    assert.deepEqual(flowIssuesCamera(outgoing,0),outgoing);
    const p=issueSurfacePlacement(outgoing), c=flowIssuesCamera(outgoing,1);
    const b=projectScreenRect({x:0,y:0,width:1280,height:720},{x:c.x+p.x*c.scale,y:c.y+p.y*c.scale,scale:c.scale*p.scale});
    close(b.x,0);close(b.y,0);close(b.width,1280);close(b.height,720);
  }
});

test('dynamic source22 audio routes restored postlude events at its new offset, frozen media unchanged', () => {
  const legacy=normalizeSettings({...s,issues:{...s.issues,sourceVersion:20}});
  assert.ok(ultimate3TypingWindows(legacy).length>0);
  assert.ok(ultimate3AgentWindowSoundTiming(legacy));
  assert.equal(ultimate3ScoreCues(legacy).issues.postludeActive,true);
  for(const settings of [s,normalizeSettings({...ULTIMATE_3_DEFAULTS,issues:{...s.issues}})]) {
    assert.ok(ultimate3TypingWindows(settings).length>0);
    assert.ok(ultimate3AgentWindowSoundTiming(settings));
    const cues=ultimate3ScoreCues(settings);
    assert.equal(cues.issues.postludeActive,true);
    assert.ok(cues.issues.pops.length>0);assert.ok(cues.issues.clusters.length>0);
  }
});
