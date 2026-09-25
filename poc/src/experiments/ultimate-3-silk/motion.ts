import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {resolveClips} from '../micro-17/timeline';
import {worldState, agentScreenPan} from '../micro-17/geometry';
import type {Progress} from '../micro-17/sample';
import {resolveMicro16Clips} from '../micro-16/timeline';
import {integratedBudgetClock} from '../micro-16/sample';
import {BASH, BUDGET_TRACE_Y} from '../micro-16/geometry';
import {introducingFlowState, ENGINE_WORLD_X, ENGINE_WORLD_Y, coverGeometry} from '../introducing-flow-1/geometry';
import type {FlowPlayback} from '../introducing-flow-1/sample';
import {ultimate2Endpoint, type ClipTiming, type Ultimate3Settings} from '../micro-18/settings';
import {chapterSchedule} from '../micro-18/sample';
import type {MotionPoint, SilkMotion} from './types';
export const clamp=(x:number,min=0,max=1)=>Math.max(min,Math.min(max,x));
export const smooth=(x:number)=>{const p=clamp(x);return p*p*(3-2*p);};
const phase=(t:number,c:ClipTiming)=>c.duration===0?Number(t>=c.at):clamp((t-c.at)/c.duration);
const pan=(x:number)=>clamp((x-640)/640,-1,1);
// Continuous edge masks avoid hard viewport cuts; use actual camera projection.
const visibility=(x:number,y:number)=>smooth((x+90)/90)*smooth((1370-x)/90)*smooth((y+90)/90)*smooth((810-y)/90);
export function compileProgress(timing:Record<string,ClipTiming>, resolved?:ReturnType<typeof resolveClips>) {
  const clips=resolved ?? computeStaticTimeline(parseTimelineConfig(Object.fromEntries(Object.entries(timing).map(([key,c])=>[key,{...c,from:{progress:0},to:{progress:1},transition:c.transition??{type:'easing',duration:c.duration,ease:[.45,0,.55,1]}}]))),{}).clips;
  const end=(key:string)=>timing[key].at+(timing[key].duration===0?0:clips.find(c=>c.key===key)!.duration);
  return {clips,end,boundaries:Object.keys(timing).flatMap(key=>[timing[key].at,end(key),timing[key].at+timing[key].duration]),
    sample:(time:number)=>Object.fromEntries(clips.map(c=>[c.key,timing[c.key].duration===0?Number(time>=timing[c.key].at):clamp((computeClipState(c,time,time) as {current:{progress:number}}).current.progress)]))};
}
/** Source equations, with timelines resolved once. Tests compare against the original pure samplers. */
export function compileMotionSamplers(s:Ultimate3Settings) {
  const u=compileProgress(s.ultimate2.timing,resolveClips(s.ultimate2.timing));
  const c=compileProgress(s.cost.timing,resolveMicro16Clips(s.cost.timing));
  const f=compileProgress(s.flow.timing);
  const uEnd=Math.min(ultimate2Endpoint(s),Math.max(...u.boundaries));
  const u2=(time:number)=>{
    const t=clamp(time,0,uEnd),p=u.sample(t) as Progress;
    const w=worldState({time:t,progress:p,streamDuration:s.ultimate2.timing.streamRun.duration,smokeTime:Math.max(0,t-s.ultimate2.timing.smokeEnter.at)},s.ultimate2.controls);
    return {turns:t*s.ultimate2.controls.loaderSpeed,distance:w.distance,pan:agentScreenPan(w),gain:w.heroAgentOpacity*w.loaderOpacity*w.agentScale*(1-w.cloudEnter),brightness:1-.3*p.upwardTurn};
  };
  const cost=(time:number)=>{
    const t=clamp(time,0,s.pacing.costTrimEnd),p=c.sample(t),timing=s.cost.timing,controls=s.cost.controls;
    const clock=integratedBudgetClock(t,timing),descent=BASH.descent*p.bashDescent;
    const camera={x:controls.travelSpeed*clock,y:960*p.cameraDownToBash+descent+1200*p.cameraDownToBudget};
    const point=(x:number,y:number,turns:number,distance:number,level=1,brightness=1)=>({turns,distance,pan:pan(x-camera.x),gain:level*visibility(x-camera.x,y-camera.y),brightness});
    const cheap=(['cheapLegOneRight','cheapLegTwoLeft','cheapLegThreeRight'] as const).map((key,row)=>point((row===1?1360:-80)+(row===1?-1440:1440)*p[key],121+row*240,clamp(t-timing[key].at,0,timing[key].duration)*controls.cheapSpinnerSpeed,1440*p[key],10**(-4/20),.85));
    let covered=0,moving=0;
    for(const key of ['purpleBashEntry','purpleBashStop','bashDescent'].sort((a,b)=>timing[a as keyof typeof timing].at-timing[b as keyof typeof timing].at)){
      const start=timing[key as keyof typeof timing].at,end=Math.min(t,c.end(key));
      moving+=Math.max(0,end-Math.max(start,covered));covered=Math.max(covered,end);
    }
    const bash=point(-80+360*p.purpleBashEntry+60*p.purpleBashStop,BASH.y+60+descent,moving*controls.purpleSpinnerSpeed,360*p.purpleBashEntry+60*p.purpleBashStop+descent);
    const power=smooth(phase(t,timing.budgetRun))*(1-smooth(phase(t,timing.budgetDepletion)));
    const budget=point(-80+720*p.purpleBudgetEntry+controls.travelSpeed*clock,BUDGET_TRACE_Y+60,(clamp(t-timing.purpleBudgetEntry.at,0,timing.purpleBudgetEntry.duration)+clock)*controls.purpleSpinnerSpeed,720*p.purpleBudgetEntry+controls.travelSpeed*clock,1,.55+.45*Math.max(power,1-p.purpleBudgetEntry));
    return {cheap,bash,budget};
  };
  const flow=(time:number)=>{
    const t=clamp(time,0,s.pacing.flowTrimEnd);
    const playback:FlowPlayback={time:t,timing:{...s.flow.timing,cloudReveal:{at:0,duration:0}},progress:{...f.sample(t),cloudReveal:1} as FlowPlayback['progress']};
    const state=introducingFlowState(playback),camera=state.camera;
    const x=camera.x+(ENGINE_WORLD_X+400)*camera.scale,y=camera.y+(ENGINE_WORLD_Y+400)*camera.scale;
    const cover=coverGeometry(state.cover,s.flow.controls.coverMotion);
    // CSS assembly is centered 563.333 x 561.667; spinner occupies the 160px top-right cell.
    const spinnerX=camera.x+(ENGINE_WORLD_X+400-563.333333/2+403.333333+80)*camera.scale;
    const spinnerY=camera.y+(ENGINE_WORLD_Y+400-561.666667/2+80)*camera.scale;
    const coverY=camera.y+(ENGINE_WORLD_Y+cover.coverY+cover.size/2)*camera.scale;
    const coverX=camera.x+(ENGINE_WORLD_X+cover.coverX+cover.size/2)*camera.scale;
    const splitVisibility='leftDoorX' in cover ? (visibility(camera.x+(ENGINE_WORLD_X+cover.leftDoorX!+cover.size/4)*camera.scale,coverY)+visibility(camera.x+(ENGINE_WORLD_X+cover.rightDoorX!+cover.size/4)*camera.scale,coverY))/2 : visibility(coverX,coverY);
    return {
      engine:{turns:state.spinnerElapsed/3,distance:state.linesElapsed*48,pan:pan(spinnerX),gain:.48*visibility(spinnerX,spinnerY)*(1-state.cover),brightness:.75},
      cover:{turns:state.coverElapsed/Math.max(s.flow.timing.coverSpinner.duration,1e-6),distance:0,pan:pan(s.flow.controls.coverMotion==='split'?x:coverX),gain:.42*splitVisibility,brightness:.8},
    };
  };
  return {u,c,f,uEnd,u2,cost,flow};
}
/** 120Hz control lattice plus every authored/resolved discontinuity. PCM never invokes a scene sampler. */
export function buildSilkMotions(s:Ultimate3Settings):SilkMotion[] {
  const a=compileMotionSamplers(s),schedule=chapterSchedule(s),motions:SilkMotion[]=[];
  const build=(id:string,offset:number,end:number,bounds:number[],sample:(t:number)=>Omit<MotionPoint,'time'>)=>{
    if(end<=0)return;
    const times=[...new Set([0,end,...bounds.filter(t=>t>=0&&t<=end),...Array.from({length:Math.ceil(end*120)},(_,i)=>i/120).filter(t=>t<end)])].sort((x,y)=>x-y);
    motions.push({id,bus:'agent',points:times.map(t=>({time:offset+t,...sample(t)}))});
  };
  build('u2-hero',0,a.uEnd,a.u.boundaries,a.u2);
  const cost=schedule[1].start;
  for(let row=0;row<3;row++)build(`cost-cheap-${row+1}`,cost,s.pacing.costTrimEnd,a.c.boundaries,t=>a.cost(t).cheap[row]);
  build('cost-bash',cost,s.pacing.costTrimEnd,a.c.boundaries,t=>a.cost(t).bash);
  build('cost-budget',cost,s.pacing.costTrimEnd,a.c.boundaries,t=>a.cost(t).budget);
  const flow=schedule[2].start+s.flow.entrySlide.at+s.flow.entrySlide.duration;
  for(const key of ['engine','cover'] as const)build(`flow-${key}`,flow,s.pacing.flowTrimEnd,a.f.boundaries,t=>a.flow(t)[key]);
  return motions;
}
