import {chapterSchedule} from '../micro-18/sample';
import {normalizeSettings,type Ultimate3Settings} from '../micro-18/settings';
import {ultimate3SangersMusicPlan} from '../micro-18/ultimate3-music';
import {sampleMicro15} from '../micro-15/sample';
import {sampleAgentWindow,SQL_PREDICATE,SQL_PREDICATE_PREFIX} from '../micro-15/agent-window';
import {ASSET_IDENTITY} from './assets';
import {assertSilkResources} from './resources';
import {buildSilkMotions,compileMotionSamplers} from './motion';
import {canonical,RECIPE_VERSION,MUSIC_RENDERER,SAMPLE_RATE,type SilkPlan,type SilkCue} from './types';
export function buildSilkPlan(input:Ultimate3Settings):SilkPlan {
  const settings=normalizeSettings(input),schedule=chapterSchedule(settings),semanticDuration=schedule.at(-1)!.end;
  // Guard before even allocating the control lattice, not only before PCM.
  assertSilkResources(semanticDuration);
  const motions=buildSilkMotions(settings),a=compileMotionSamplers(settings),cues:SilkCue[]=[];
  const add=(id:string,bus:SilkCue['bus'],recipe:SilkCue['recipe'],at:number,duration:number,limit:number,gain=1,pan=0,notes?:readonly number[])=>{
    duration=Math.min(duration,limit-at);
    if(at<0||duration<1/SAMPLE_RATE||at>=limit)return;
    let seed=2166136261;for(const c of id)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
    cues.push({id,bus,recipe,at,duration,seed,gain,pan,...(notes?{notes,principal:true}:{})});
  };
  const u=settings.ultimate2.timing,uLimit=Math.min(schedule[0].end,a.uEnd);
  const uMove=(id:string,key:keyof typeof u,bus:SilkCue['bus'],recipe:SilkCue['recipe'],gain=1)=>{
    if(u[key].duration>0)add(id,bus,recipe,u[key].at,Math.min(.5,a.u.end(key)-u[key].at),uLimit,gain);
  };
  uMove('u2-cloud-inhale','firstThinking','air','air',.7);
  // First visible translation, not a fixed global cue or every spin revolution.
  const hero=motions.find(m=>m.id==='u2-hero');
  const launch=hero?.points.find((p,i,points)=>i>0&&p.gain>.1&&Math.abs(p.distance-points[i-1].distance)>.001);
  if(launch)add('u2-launch','sparkle','flourish',launch.time,.53,uLimit,.72,launch.pan,[81,88]);
  uMove('u2-turn-color','upwardTurn','material','down',.4);
  uMove('u2-reversal','cameraBacktrack','air','air',.65);
  for(const key of ['redThinkingLift','readLift','thinkingLift'] as const)uMove(`u2-${key}`,key,'material','release',.6);
  if(u.warningFocus.duration>0)add('u2-focus-seat','material','seat',a.u.end('warningFocus'),.22,uLimit,.55);
  if(u.finalZoom.duration>0&&u.finalZoom.at<uLimit)add('u2-insight','sparkle','flourish',u.finalZoom.at,.65,uLimit,.8,0,[78,81,88]);
  uMove('u2-cloud-departure','cloudEnter','air','air',.5);
  const cost=schedule[1].start,cLimit=cost+settings.pacing.costTrimEnd,ct=settings.cost.timing;
  if(ct.bashExpand.duration>0)add('cost-bash-open','material','release',cost+ct.bashExpand.at,Math.min(.35,a.c.end('bashExpand')-ct.bashExpand.at),cLimit,.85);
  const budgetStop=ct.budgetDepletion.at+ct.budgetDepletion.duration;
  if(ct.budgetDepletion.duration>0&&budgetStop<settings.pacing.costTrimEnd)add('cost-budget-seat','material','seat',cost+budgetStop,.18,cLimit,.4);
  const flow=schedule[2].start,entry=settings.flow.entrySlide,fo=flow+entry.at+entry.duration,ft=settings.flow.timing,fLimit=fo+settings.pacing.flowTrimEnd;
  if(entry.duration>0)add('flow-camera-bridge','air','air',flow+entry.at,Math.min(entry.duration,.8),fo,.85);
  if(settings.pacing.flowTrimEnd>0)add('flow-introduction','sparkle','flourish',fo,.7,fLimit,1,0,[81,88,90]);
  if(ft.modelRows.duration>0)add('flow-rows-group','material','release',fo+ft.modelRows.at,Math.min(.6,Math.max(a.f.end('modelRows'),ft.modelRows.at+ft.modelRows.duration+5*settings.flow.controls.numberRowStagger)-ft.modelRows.at),fLimit,.55);
  if(ft.barsGrow.duration>0)add('flow-bars-lift','material','lift',fo+ft.barsGrow.at,Math.min(.6,a.f.end('barsGrow')-ft.barsGrow.at),fLimit,.45);
  const complete=Math.max(a.f.end('barsGrow'),a.f.end('analysisCountUp'));
  if(ft.analysisCountUp.duration>0&&complete<settings.pacing.flowTrimEnd)add('flow-analysis-arrival','material','seat',fo+complete,.22,fLimit,.5);
  if(ft.coverDescent.duration>0)add('flow-cover-pair','material','release',fo+ft.coverDescent.at,Math.min(.55,a.f.end('coverDescent')-ft.coverDescent.at),fLimit,.75);
  const issues=schedule[3],io=issues.start+settings.issues.leadIn.at+settings.issues.leadIn.duration,it=settings.issues.timing;
  const cluster=sampleMicro15(0,settings.issues.controls,it).clusters;
  const readiness=Math.max(...Object.values(cluster).map(c=>c.readyAt));
  const assembly=Math.max(...Object.values(cluster).flatMap(c=>[it.coverAppearance,it.triangleScaleOut,it.triangleScaleIn].map(t=>Math.max(c.readyAt,t.at)+t.duration)));
  if(settings.issues.controls.travelDuration>0)add('issues-gather','air','air',io+it.travelStart.at,Math.min(.8,readiness-it.travelStart.at),issues.end,.65);
  add('issues-assembly-seat','material','seat',io+assembly,.2,issues.end,.75);
  for(const key of ['agentWindowEnter','agentWindowExit'] as const)if(it[key].duration>0)add(`issues-${key}`,'material','release',io+it[key].at,Math.min(.45,it[key].duration),issues.end,.65);
  const sendEnd=it.messageSend.at+it.messageSend.duration;
  const windows=(['promptTyping','issueTyping','cliCommandTyping','sqlQueryTyping','sqlPredicateTyping'] as const).map((key,i)=>{
    const t=it[key],start=Math.max(t.at,i>=2?sendEnd:0,it.agentWindowEnter.at+1/SAMPLE_RATE);
    return {start,end:Math.min((i>=2?Math.max(t.at,sendEnd):t.at)+t.duration,it.agentWindowExit.at+it.agentWindowExit.duration,i<2?sendEnd:Infinity)};
  }).filter(w=>w.end>w.start).sort((x,y)=>x.start-y.start);
  const merged:{start:number;end:number}[]=[];
  for(const w of windows){const last=merged.at(-1);if(last&&w.start<=last.end)last.end=Math.max(last.end,w.end);else merged.push({...w});}
  let lastTouch=-Infinity,count=0;
  for(const w of merged)for(let t=Math.max(w.start,lastTouch+.13);t<w.end-.004;t+=.13){
    if(!sampleAgentWindow(t,it).visible)continue;
    add(`issues-writing-${++count}`,'typing','touch',io+t,Math.min(.035,w.end-t),issues.end,.7);lastTouch=t;
  }
  const predicate=it.sqlPredicateTyping,iconAt=Math.max(predicate.at,sendEnd)+predicate.duration*(SQL_PREDICATE_PREFIX.length+1)/SQL_PREDICATE.length;
  const payoff=Math.max(it.queryWarningIn.at,iconAt)+it.queryWarningIn.duration;
  if(sampleAgentWindow(payoff,it).visible)add('issues-payoff','sparkle','flourish',io+payoff,.5,Math.min(issues.end,io+it.agentWindowExit.at),.68,0,[81,86]);
  const logo=schedule[4].start+settings.conclusion.logo.at;
  if(settings.conclusion.logo.duration>0)add('logo-warm-landing','material','halo',logo,Math.min(1.1,settings.conclusion.logo.duration),semanticDuration,.65);
  const music=ultimate3SangersMusicPlan(settings);
  const settingsKey=canonical(settings),identity=canonical({settings:settingsKey,recipe:RECIPE_VERSION,musicRenderer:MUSIC_RENDERER,musicEvents:music,assets:ASSET_IDENTITY,sampleRate:SAMPLE_RATE,fps:30});
  return {version:1,identity,settingsKey,recipeVersion:RECIPE_VERSION,assetIdentity:ASSET_IDENTITY,settings,semanticDuration,frameDuration:Math.ceil(semanticDuration*30)/30,sampleRate:SAMPLE_RATE,motions,cues:cues.sort((x,y)=>x.at-y.at||x.id.localeCompare(y.id)),music,chapterStarts:{cost,flow,issues:issues.start,conclusion:schedule[4].start}};
}
