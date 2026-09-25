import type {TimelineConfig,TransitionConfig} from 'dialkit';
import {computeStaticTimeline,parseTimelineConfig} from 'dialkit/timeline';
import {MICRO_15_DEFAULTS,MICRO_15_TIMELINE,MICRO_15_TIMING,type Micro15Controls,type Micro15Timing} from '../micro-15/timeline';

export type ClipTiming={at:number;duration:number;transition?:TransitionConfig};
export const MICRO_20_TIMELINE_ID='micro-animation-20-main-timeline-v1';
export const MICRO_20_ISSUES_TIMELINE_ID='micro-animation-20-issues-timeline-v1';
export const MICRO_20_CONTROLS_ID='micro-animation-20-prelude-controls-v1';
export const MICRO_20_ISSUES_CONTROLS_ID='micro-animation-20-issues-controls-v1';
export const ISSUE_START=7.5;
const ease=[.45,0,.55,1] as [number,number,number,number];
const clip=(at:number,duration:number):ClipTiming&{from:{progress:number};to:{progress:number}}=>({at,duration,from:{progress:0},to:{progress:1},transition:{type:'easing',duration,ease}});
export const PRELUDE_TIMING={
  blueBashEntry:clip(.4,.75),blueBashStop:clip(1.1,.25),bashExpand:clip(1.28,.2),
  bashDescent:clip(1.45,1.84),bashHighlight:clip(2.85,.55),analysisZoomOut:clip(3.45,2),
  analysisCircleGrow:clip(5.25,1.9),analysisWarningsRadial:clip(5.55,1.85),analysisCircleFade:clip(7.05,.35),analysisAgentScaleOut:clip(7.05,.45),
} as const;
export type PreludeTiming={readonly [K in keyof typeof PRELUDE_TIMING]:ClipTiming};
export const MICRO_20_DEFAULTS={spinnerSpeed:1.9,radialCircleRadius:820,radialSoftness:.2,timelineDuration:ISSUE_START+MICRO_15_DEFAULTS.timelineDuration};
export type Micro20Controls=typeof MICRO_20_DEFAULTS;
export const MICRO_20_ISSUE_DEFAULTS:Micro15Controls={...MICRO_15_DEFAULTS,warningAppearanceDuration:0};
export const MICRO_20_ISSUE_TIMING:Micro15Timing={...MICRO_15_TIMING,appearance:{at:0,duration:0}};
export const PRELUDE_KEYS=Object.keys(PRELUDE_TIMING) as (keyof PreludeTiming)[];
export const ISSUE_KEYS=(Object.keys(MICRO_20_ISSUE_TIMING) as (keyof Micro15Timing)[]).filter(key=>key!=='appearance');
export const MICRO_20_TIMELINE={duration:MICRO_20_DEFAULTS.timelineDuration,...PRELUDE_TIMING,issueHandoff:clip(ISSUE_START,0)} satisfies TimelineConfig;
export const MICRO_20_ISSUES_TIMELINE={duration:MICRO_15_DEFAULTS.timelineDuration,...Object.fromEntries(ISSUE_KEYS.map(key=>[key,(MICRO_15_TIMELINE as any)[key]??clip(MICRO_20_ISSUE_TIMING[key].at,MICRO_20_ISSUE_TIMING[key].duration)]))} satisfies TimelineConfig;
const finite=(n:number,f:number)=>Number.isFinite(n)?n:f;
export const normalizeMicro20Controls=(v:Partial<Micro20Controls>={}):Micro20Controls=>({spinnerSpeed:Math.max(0,Math.min(10,finite(v.spinnerSpeed!,MICRO_20_DEFAULTS.spinnerSpeed))),radialCircleRadius:Math.max(0,Math.min(1400,finite(v.radialCircleRadius!,MICRO_20_DEFAULTS.radialCircleRadius))),radialSoftness:Math.max(0,Math.min(1,finite(v.radialSoftness!,MICRO_20_DEFAULTS.radialSoftness))),timelineDuration:Math.max(1,Math.min(60,finite(v.timelineDuration!,MICRO_20_DEFAULTS.timelineDuration)))});
export const normalizeIssueStart=(value:number)=>Math.max(0,Math.min(60,finite(value,ISSUE_START)));
export function normalizePreludeTiming(input:Partial<PreludeTiming>=PRELUDE_TIMING):PreludeTiming{return Object.fromEntries(PRELUDE_KEYS.map(key=>{const fallback=PRELUDE_TIMING[key],value=input[key];return[key,{at:Math.max(0,finite(value?.at!,fallback.at)),duration:Math.max(0,finite(value?.duration!,fallback.duration)),transition:value?.transition??fallback.transition}]})) as PreludeTiming;}
export function resolvePreludeClips(input:Partial<PreludeTiming>=PRELUDE_TIMING){const timing=normalizePreludeTiming(input);return computeStaticTimeline(parseTimelineConfig(Object.fromEntries(PRELUDE_KEYS.map(key=>[key,{...PRELUDE_TIMING[key],...timing[key]}]))),{}).clips;}
export const micro20DurationFrames=(props:Partial<Micro20Controls>&{preludeTiming?:PreludeTiming;issueTiming?:Micro15Timing;issueStart?:number}={})=>{const controls=normalizeMicro20Controls(props),prelude=normalizePreludeTiming(props.preludeTiming),issue=props.issueTiming??MICRO_20_ISSUE_TIMING,start=normalizeIssueStart(props.issueStart??ISSUE_START);const end=Math.max(controls.timelineDuration,...resolvePreludeClips(prelude).map(c=>{const authored=prelude[c.key as keyof PreludeTiming];return authored.at+(authored.duration===0?0:Math.max(authored.duration,c.duration));}),...Object.values(issue).map(c=>start+c.at+c.duration));return Math.ceil(end*30-1e-9);};
