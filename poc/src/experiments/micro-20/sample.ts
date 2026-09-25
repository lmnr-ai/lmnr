import {computeClipState} from 'dialkit/timeline';
import {CELL_COUNT,cellCenter} from '../micro-14/geometry';
import {START_CELLS} from '../micro-15/starting-positions';
import {sampleMicro15,sampleMicro15Live} from '../micro-15/sample';
import type {Micro15Controls,Micro15Timing} from '../micro-15/timeline';
import {MICRO_20_DEFAULTS,MICRO_20_ISSUE_DEFAULTS,MICRO_20_ISSUE_TIMING,PRELUDE_TIMING,ISSUE_START,normalizeIssueStart,normalizeMicro20Controls,normalizePreludeTiming,resolvePreludeClips,type Micro20Controls,type PreludeTiming} from './timeline';

const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{const p=clamp(n);return p*p*(3-2*p)};
export const HERO_CELL=98;
export function sampleMicro20(timeInput:number,rawControls:Partial<Micro20Controls>=MICRO_20_DEFAULTS,timingInput:PreludeTiming=PRELUDE_TIMING,issueControls:Micro15Controls=MICRO_20_ISSUE_DEFAULTS,issueTiming:Micro15Timing=MICRO_20_ISSUE_TIMING,issueStartInput=ISSUE_START,liveProgress?:Partial<Record<keyof PreludeTiming,number>>,issueLiveTimeline?:any){
  const time=Number.isFinite(timeInput)?Math.max(0,timeInput):0;
  const controls=normalizeMicro20Controls(rawControls),timing=normalizePreludeTiming(timingInput),issueStart=normalizeIssueStart(issueStartInput);
  const clips=resolvePreludeClips(timing);
  const p=Object.fromEntries(clips.map(c=>{const key=c.key as keyof PreludeTiming;const pure=timing[key].duration===0?Number(time>=timing[key].at):clamp((computeClipState(c,time,time) as {current:{progress:number}}).current.progress);return[key,liveProgress?.[key]??pure]})) as Record<keyof PreludeTiming,number>;
  if(time>=issueStart){const issueLocal=Math.round((time-issueStart)*1e9)/1e9;const ownedTiming={...issueTiming,appearance:{at:0,duration:0}};return Object.freeze({time,issueStart,phase:'issues' as const,issue:issueLiveTimeline?sampleMicro15Live(issueLocal,issueControls,ownedTiming,issueLiveTimeline):sampleMicro15(issueLocal,issueControls,ownedTiming),progress:p,controls});}
  const descent=2040*p.bashDescent;
  const bashAgent={x:-80+360*p.blueBashEntry+60*p.blueBashStop,y:1321+descent,angle:(Math.min(time,timing.blueBashEntry.at+timing.blueBashEntry.duration)-Math.min(time,timing.blueBashEntry.at)+Math.max(0,Math.min(time,timing.bashDescent.at+timing.bashDescent.duration)-timing.bashDescent.at))*controls.spinnerSpeed*360};
  const zoom=p.analysisZoomOut;
  const radius=controls.radialCircleRadius*p.analysisCircleGrow;
  const warningRadius=controls.radialCircleRadius*p.analysisWarningsRadial;
  const maxDistance=Math.hypot(640,360);
  const warnings=Object.entries(START_CELLS).map(([id,cell])=>{const point=cellCenter(cell);const distance=Math.hypot(point.x-640,point.y-360);const reach=warningRadius+controls.radialSoftness*78;const scale=p.analysisWarningsRadial>=1?1:smooth((reach-distance)/(78*(.25+controls.radialSoftness)));return {id,cell,...point,scale};});
  return Object.freeze({time,issueStart,phase:zoom>0?'analysis' as const:'bash' as const,progress:p,controls,bashAgent,descent,
    paperHeight:2400*p.bashExpand,camera:{x:-300*p.blueBashStop,y:961+descent},zoom,gridPitch:120+(78-120)*zoom,
    hero:{x:640,y:360,scale:1-p.analysisAgentScaleOut,angle:time*controls.spinnerSpeed*360},radius,warnings,
    dots:Array.from({length:CELL_COUNT},(_,cell)=>{const warning=warnings.find(w=>w.cell===cell);return {...cellCenter(cell),cell,scale:zoom*(cell===HERO_CELL?p.analysisAgentScaleOut:warning?1-warning.scale:1)}}),
    analyzedFraction:radius/maxDistance,
  });
}
export type Micro20Sample=ReturnType<typeof sampleMicro20>;
export const sampleMicro20Frame=(frame:number,controls?:Partial<Micro20Controls>,timing?:PreludeTiming,issueControls?:Micro15Controls,issueTiming?:Micro15Timing,issueStart?:number)=>sampleMicro20(frame/30,controls,timing,issueControls,issueTiming,issueStart);
export const radialOrderIsMonotonic=(sample:Extract<Micro20Sample,{phase:'bash'|'analysis'}>)=>sample.warnings.slice().sort((a,b)=>Math.hypot(a.x-640,a.y-360)-Math.hypot(b.x-640,b.y-360)).every((w,i,a)=>i===0||a[i-1].scale>=w.scale);
