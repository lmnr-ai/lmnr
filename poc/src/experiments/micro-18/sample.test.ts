import assert from 'node:assert/strict';
import test from 'node:test';
import {chapterSchedule, locateChapter, sampleFlow, sampleUltimate3, ultimate3DurationFrames} from './sample';
import {ULTIMATE_3_DEFAULTS, migrateStoredFlowCover, migrateStoredIssueTimeline, migrateStoredSettings, migrateStoredUltimate2Timeline, normalizeSettings} from './settings';
import {sampleMicro17} from '../micro-17/sample';
import {sampleMicro16} from '../micro-16/sample';
import {sampleMicro15} from '../micro-15/sample';
import {sampleIntroducingFlow1} from '../introducing-flow-1/sample';
import {FLOW_CLIP_KEYS} from '../introducing-flow-1/timeline';
import {worldState} from '../micro-17/geometry';
import {authoredStageSize} from './layout';
import {liveFlowPreview} from './authoring';

test('default schedule shifts every chapter after the fourteen-block stream trim', () => {
  const schedule=chapterSchedule(ULTIMATE_3_DEFAULTS);assert.equal(schedule.length,5);
  const ultimate2Duration=ULTIMATE_3_DEFAULTS.allocations.ultimate2;
  assert.deepEqual(schedule.map(s=>[s.id,s.start,s.duration]),[
    ['ultimate2',0,ultimate2Duration],['cost',ultimate2Duration,15],['flow',ultimate2Duration+15,13],
    ['issues',ultimate2Duration+28,7.5],['conclusion',ultimate2Duration+35.5,4],
  ]);
  assert.equal(ultimate3DurationFrames(ULTIMATE_3_DEFAULTS),1621);
});
test('boundaries select incoming chapter and far future holds logo',()=>{const s=chapterSchedule(ULTIMATE_3_DEFAULTS);for(let i=1;i<s.length;i++)assert.equal(locateChapter(s[i].start,ULTIMATE_3_DEFAULTS).segment.id,s[i].id);assert.equal(sampleUltimate3(1e9,ULTIMATE_3_DEFAULTS).conclusion,'logo');assert.equal(locateChapter(-2,ULTIMATE_3_DEFAULTS).time,0);assert.equal(locateChapter(Number.NaN,ULTIMATE_3_DEFAULTS).time,0)});
test('editable 17 entry endpoint plus hold ripples later starts',()=>{const edited=normalizeSettings({...ULTIMATE_3_DEFAULTS,ultimate2:{...ULTIMATE_3_DEFAULTS.ultimate2,timing:{...ULTIMATE_3_DEFAULTS.ultimate2.timing,cloudEnter:{...ULTIMATE_3_DEFAULTS.ultimate2.timing.cloudEnter,at:24,duration:2}}}});const schedule=chapterSchedule(edited);assert.equal(schedule[0].duration,26.5);assert.equal(schedule[1].start,26.5)});
test('late source-only Animation17 tracks do not resurrect the explicitly trimmed tail',()=>{const edited=normalizeSettings({...ULTIMATE_3_DEFAULTS,ultimate2:{...ULTIMATE_3_DEFAULTS.ultimate2,timing:{...ULTIMATE_3_DEFAULTS.ultimate2.timing,subtitleIfOnly:{...ULTIMATE_3_DEFAULTS.ultimate2.timing.subtitleIfOnly,at:100,duration:20}}}});assert.equal(chapterSchedule(edited)[0].duration,ULTIMATE_3_DEFAULTS.allocations.ultimate2);assert.equal(chapterSchedule(edited)[1].start,ULTIMATE_3_DEFAULTS.allocations.ultimate2)});
test('Flow entry is held, clouds are settled, and zero duration is an instant step',()=>{const zero=normalizeSettings({...ULTIMATE_3_DEFAULTS,flow:{...ULTIMATE_3_DEFAULTS.flow,entrySlide:{at:0,duration:0}}});assert.equal(sampleFlow(0,zero).entryProgress,1);assert.equal(sampleFlow(0,zero).nativeTime,0);assert.equal(sampleFlow(.6,ULTIMATE_3_DEFAULTS).playback.time,0);assert.equal(sampleFlow(1.2,ULTIMATE_3_DEFAULTS).playback.progress.cloudReveal,1);assert.equal(sampleFlow(1.2,ULTIMATE_3_DEFAULTS).playback.progress.cloudExit,0)});
test('obsolete generated allocations migrate without erasing other authored values',()=>{const normalized=normalizeSettings({version:2,allocations:{ultimate2:22,cost:17,flow:14.5,issues:9,conclusion:5},flow:{entrySlide:{duration:Number.NaN},controls:{coverMotion:'bad'}}});assert.deepEqual(normalized.allocations,{ultimate2:ULTIMATE_3_DEFAULTS.allocations.ultimate2,cost:15,flow:13,issues:9,conclusion:5});assert.equal(normalized.flow.entrySlide.duration,1.2);assert.equal(normalized.flow.controls.coverMotion,'split')});
test('stored generated Ultimate 2 defaults lose fourteen blocks while custom timing remains authoritative',()=>{
  const legacy=structuredClone(normalizeSettings(ULTIMATE_3_DEFAULTS)) as any;
  const shiftedKeys=['continueStraight','upwardTurn','cameraBacktrack','redThinkingLift','readLift','thinkingLift','highlight','warningEnter','warningFocus','finalZoom','streamCollapse','loaderFade','dotDim','smallGridFade','cloudEnter','cloudHold','subtitleFailure','subtitleWhy','subtitleInsights','subtitleIfOnly'];
  for(const key of shiftedKeys) legacy.ultimate2.timing[key].at+=46/11;
  for(const key of ['streamRun','subtitleTrace']) {legacy.ultimate2.timing[key].duration+=46/11;legacy.ultimate2.timing[key].transition.duration+=46/11;}
  legacy.allocations.ultimate2=18.7;
  const migrated=migrateStoredUltimate2Timeline(legacy) as any;
  assert.deepEqual(migrated.ultimate2.timing,ULTIMATE_3_DEFAULTS.ultimate2.timing);
  assert.equal(migrated.allocations.ultimate2,ULTIMATE_3_DEFAULTS.allocations.ultimate2);
  const custom=structuredClone(legacy);custom.ultimate2.timing.streamRun.duration=6;
  assert.equal(migrateStoredUltimate2Timeline(custom),custom,'custom authored timing is untouched');
});
test('stored generated Issues defaults migrate while custom Issue timing remains authoritative',()=>{
  const legacy=structuredClone(ULTIMATE_3_DEFAULTS) as any;
  legacy.allocations.issues=6.5; legacy.issues.controls.timelineDuration=6;
  legacy.issues.timing={appearance:{at:0,duration:.93},travelStart:{at:.94,duration:.35},coverAppearance:{at:1.31,duration:.38},triangleScaleOut:{at:1.1,duration:.36},triangleScaleIn:{at:1.24,duration:.68},agentWindowEnter:{at:2.83,duration:.47},promptTyping:{at:2.87,duration:.44},issueTyping:{at:3.23,duration:.27},issuePadding:{at:3.21,duration:.35},issueBackground:{at:3.24,duration:.2},issueWarningIn:{at:3.4,duration:.3},messageSend:{at:3.65,duration:.18},cliCommandTyping:{at:3.78,duration:.26},sqlQueryTyping:{at:3.99,duration:.23},sqlPredicateTyping:{at:4.18,duration:.27},queryWarningIn:{at:4.16,duration:.2},agentWindowExit:{at:5.34,duration:.38},subtitleIssues:{at:0,duration:.94},subtitlePatterns:{at:.94,duration:1.89},subtitleReady:{at:2.83,duration:3.17}};
  const migrated=migrateStoredIssueTimeline(legacy) as any;
  assert.deepEqual(migrated.issues.timing,ULTIMATE_3_DEFAULTS.issues.timing);assert.equal(migrated.issues.controls.timelineDuration,7);assert.equal(migrated.allocations.issues,7.5);
  const custom=structuredClone(legacy);custom.issues.timing.appearance.duration=.5;
  assert.equal(migrateStoredIssueTimeline(custom),custom,'custom authored timing is untouched');
});
test('stored generated top cover migrates once while custom modes and imports remain authoritative',()=>{
  const old={...structuredClone(ULTIMATE_3_DEFAULTS),flow:{...structuredClone(ULTIMATE_3_DEFAULTS.flow),controls:{...ULTIMATE_3_DEFAULTS.flow.controls,coverMotion:'top' as const}}};
  const first=normalizeSettings(migrateStoredFlowCover(old));
  const second=normalizeSettings(migrateStoredFlowCover(first));
  assert.equal(first.flow.controls.coverMotion,'split');
  assert.deepEqual(second,first,'a second storage load is idempotent');
  const custom={...old,flow:{...old.flow,controls:{...old.flow.controls,coverMotion:'right' as const}}};
  assert.equal(migrateStoredFlowCover(custom),custom,'non-obsolete custom cover mode is not rewritten');
  assert.equal(normalizeSettings(old).flow.controls.coverMotion,'top','explicit JSON import bypasses storage migration');
  assert.equal(normalizeSettings({}).flow.controls.coverMotion,'split','missing cover mode uses the new default');
});
test('stored generated conclusion migrates once while custom settings and imports remain authoritative',()=>{
  const old={...structuredClone(ULTIMATE_3_DEFAULTS),allocations:{...ULTIMATE_3_DEFAULTS.allocations,conclusion:6},conclusion:{placeholder:{at:0,duration:1},logo:{at:1,duration:1}}};
  const first=normalizeSettings(migrateStoredSettings(old));
  const second=normalizeSettings(migrateStoredSettings(first));
  assert.deepEqual(first.conclusion,{placeholder:{at:0,duration:2,transition:undefined},logo:{at:2,duration:2,transition:undefined}});
  assert.equal(first.allocations.conclusion,6,'extended allocation is preserved');
  assert.deepEqual(second,first,'a second storage load does not double durations');
  const custom={...old,conclusion:{placeholder:{at:.25,duration:1},logo:{at:1.25,duration:1}}};
  assert.equal(migrateStoredSettings(custom),custom,'custom conclusion is not rewritten');
  const explicit=normalizeSettings({...old,allocations:{...old.allocations,conclusion:2}});
  assert.deepEqual(explicit.conclusion,{placeholder:{at:0,duration:1,transition:undefined},logo:{at:1,duration:1,transition:undefined}},'authoritative import can set 1s + 1s');
  assert.equal(explicit.allocations.conclusion,2);
});
test('reused chapters preserve source samplers away from deliberate trims',()=>{const s=ULTIMATE_3_DEFAULTS;const schedule=chapterSchedule(s);assert.deepEqual(sampleUltimate3(8,s).ultimate2,sampleMicro17(8,s.ultimate2.timing));assert.deepEqual(sampleUltimate3(schedule[1].start+8,s).cost,sampleMicro16(8,s.cost.controls,s.cost.timing));assert.deepEqual(sampleUltimate3(schedule[3].start+.5+4,s).issues?.sample,sampleMicro15(4,s.issues.controls,s.issues.timing));const adapted=sampleFlow(1.2+7,s).playback;const original=sampleIntroducingFlow1(7);for(const key of Object.keys(original.progress))if(key!=='cloudReveal')assert.ok(Math.abs(adapted.progress[key as keyof typeof adapted.progress]-original.progress[key as keyof typeof original.progress])<1e-12)});
test('Cost and Flow freeze at their actual clipped native endpoints',()=>{const s=ULTIMATE_3_DEFAULTS;const schedule=chapterSchedule(s);const nearEnd=sampleUltimate3(schedule[1].end-1e-6,s).cost!;const nativeNearEnd=sampleMicro16(15-1e-6,s.cost.controls,s.cost.timing);assert.ok(Math.abs(nearEnd.time-(15-1e-6))<1e-10);assert.ok(Math.abs(nearEnd.progress.subtitleCost-nativeNearEnd.progress.subtitleCost)<1e-12);assert.deepEqual({...nearEnd,time:0,progress:{...nearEnd.progress,subtitleCost:0}},{...nativeNearEnd,time:0,progress:{...nativeNearEnd.progress,subtitleCost:0}});assert.equal(sampleFlow(1e6,s).nativeTime,11.8);assert.deepEqual(sampleUltimate3(schedule[2].start,s).flow?.outgoingCost,sampleMicro16(15,s.cost.controls,s.cost.timing))});
test('paused Flow preview uses the deterministic endpoint during an extended hold',()=>{const s=normalizeSettings({...ULTIMATE_3_DEFAULTS,allocations:{...ULTIMATE_3_DEFAULTS.allocations,flow:16}});const time=s.flow.entrySlide.at+s.flow.entrySlide.duration+14;const bogus=Object.fromEntries(FLOW_CLIP_KEYS.map(key=>[key,{current:{progress:.123}}]));const live=liveFlowPreview({...bogus,time,entrySlide:{current:{progress:1}}},s);assert.deepEqual(live,sampleFlow(time,s));});
test('17 to Cost cloud handoff has one identical boundary pose and continuous exit',()=>{const s=ULTIMATE_3_DEFAULTS;const end17=worldState(sampleMicro17(18.7,s.ultimate2.timing),s.ultimate2.controls);const startCost=sampleMicro16(0,s.cost.controls,s.cost.timing);assert.equal(end17.cloudProgress,0);assert.equal(end17.cloudTranslateY,0);assert.equal(Math.abs(end17.cloudTranslateX[0]),0);assert.equal(end17.cloudTranslateX[1],0);assert.equal(27+10*startCost.progress.cloudSweep,27);const mid=sampleMicro16(2,s.cost.controls,s.cost.timing);assert.ok(mid.progress.cloudSweep>0&&mid.progress.cloudSweep<1);assert.ok(27+10*mid.progress.cloudSweep>27)});
test('placeholder and logo boundaries are exact local frames',()=>{const s=chapterSchedule(ULTIMATE_3_DEFAULTS);const issues=s[3].start;const conclusion=s[4].start;assert.equal(sampleUltimate3(issues+14/30,ULTIMATE_3_DEFAULTS).issues?.placeholder,true);assert.equal(sampleUltimate3(issues+15/30,ULTIMATE_3_DEFAULTS).issues?.placeholder,false);assert.equal(sampleUltimate3(conclusion+59/30,ULTIMATE_3_DEFAULTS).conclusion,'placeholder');assert.equal(sampleUltimate3(conclusion+60/30,ULTIMATE_3_DEFAULTS).conclusion,'logo');assert.equal(sampleUltimate3(conclusion+119/30,ULTIMATE_3_DEFAULTS).conclusion,'logo')});
test('retiming the conclusion placeholder ripples the visible logo cut',()=>{const edited=normalizeSettings({...ULTIMATE_3_DEFAULTS,allocations:{...ULTIMATE_3_DEFAULTS.allocations,conclusion:0},conclusion:{placeholder:{at:.25,duration:1.5},logo:{at:1,duration:2}}});const start=chapterSchedule(edited)[4].start;assert.equal(edited.conclusion.logo.at,1.75);assert.equal(sampleUltimate3(start+1.74,edited).conclusion,'placeholder');assert.equal(sampleUltimate3(start+1.75,edited).conclusion,'logo');assert.equal(chapterSchedule(edited)[4].duration,3.75)});
test('live resize containment remains uniform for larger and different-aspect hosts',()=>{assert.deepEqual(authoredStageSize(1600,900),{scale:1.25,width:1600,height:900});assert.deepEqual(authoredStageSize(1600,700),{scale:700/720,width:1280*(700/720),height:700});assert.deepEqual(authoredStageSize(800,900),{scale:.625,width:800,height:450})});
