import {useEffect,useRef} from 'react';
import {DialRoot,DialTimeline,useDialKit,useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import type {Micro15Timing} from '../micro-15/timeline';
import {ISSUE_KEYS,ISSUE_START,MICRO_20_CONTROLS_ID,MICRO_20_DEFAULTS,MICRO_20_ISSUES_CONTROLS_ID,MICRO_20_ISSUES_TIMELINE,MICRO_20_ISSUES_TIMELINE_ID,MICRO_20_TIMELINE,MICRO_20_TIMELINE_ID,PRELUDE_KEYS,PRELUDE_TIMING,type PreludeTiming} from './timeline';
import {sampleMicro20} from './sample';
import {Micro20Scene} from './Scene';

export const Micro20App=()=>{
  const editor=useRef<HTMLElement>(null),host=useRef<HTMLDivElement>(null),stage=useRef<HTMLDivElement>(null);
  const controls=useDialKit('Animation 20 · Analysis',{spinnerSpeed:[MICRO_20_DEFAULTS.spinnerSpeed,0,10,.1],radialCircleRadius:[MICRO_20_DEFAULTS.radialCircleRadius,0,1400,10],radialSoftness:[MICRO_20_DEFAULTS.radialSoftness,0,1,.05],timelineDuration:[MICRO_20_DEFAULTS.timelineDuration,1,60,.1]},{id:MICRO_20_CONTROLS_ID,persist:true});
  const issueDials=useDialKit('Animation 20 · Issues',{travelDuration:[2.3,0,10,.05],timelineDuration:[7,1,60,.1]},{id:MICRO_20_ISSUES_CONTROLS_ID,persist:true});
  const issueControls={warningAppearanceDuration:0,...issueDials};
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline=useDialTimeline('Animation 20 — Prelude and handoff',{...MICRO_20_TIMELINE,duration:controls.timelineDuration},{id:MICRO_20_TIMELINE_ID,autoplay:true,loop:true,persist:true});
  // TODO(production): Preserve this native issue-detail authoring view when replacing DialKit preview animations.
  const issueTimeline=useDialTimeline('Animation 20 — Issue postlude (native seconds)',{...MICRO_20_ISSUES_TIMELINE,duration:issueControls.timelineDuration},{id:MICRO_20_ISSUES_TIMELINE_ID,autoplay:false,loop:false,persist:true});
  const query=new URLSearchParams(location.search),requested=Number(query.get('time'));
  const inspecting=query.has('time')&&Number.isFinite(requested)&&requested>=0;
  const time=inspecting?requested:timeline.time;
  const issueStart=Number.isFinite(timeline.issueHandoff?.at)?timeline.issueHandoff.at:ISSUE_START;
  const timing=Object.fromEntries(PRELUDE_KEYS.map(key=>{const value=(timeline as any)[key];return[key,{at:value?.at??PRELUDE_TIMING[key].at,duration:value?.duration??PRELUDE_TIMING[key].duration,transition:value?.transition??PRELUDE_TIMING[key].transition}]})) as PreludeTiming;
  const issueTiming={appearance:{at:0,duration:0},...Object.fromEntries(ISSUE_KEYS.map(key=>{const value=(issueTimeline as any)[key];return[key,{at:value?.at??0,duration:value?.duration??0}]}))} as Micro15Timing;
  const liveProgress=inspecting?undefined:Object.fromEntries(PRELUDE_KEYS.map(key=>[key,(timeline as any)[key]?.current?.progress]));
  useEffect(()=>{if(inspecting)return;issueTimeline.pause();issueTimeline.seek(Math.max(0,time-issueStart));},[inspecting,time,issueStart]);
  useEffect(()=>{let dock:Element|null=null;const update=()=>{const r=dock?.getBoundingClientRect();editor.current?.style.setProperty('--micro20-dock',`${r&&r.height?innerHeight-r.top+6:0}px`)};const ro=new ResizeObserver(update),mo=new MutationObserver(()=>{const next=document.querySelector('.dialkit-timeline');if(next!==dock){ro.disconnect();dock=next;if(dock)ro.observe(dock)}update()});mo.observe(document.body,{childList:true,subtree:true});update();addEventListener('resize',update);return()=>{ro.disconnect();mo.disconnect();removeEventListener('resize',update)}},[]);
  useEffect(()=>{const resize=()=>{if(!host.current||!stage.current)return;const scale=Math.min(host.current.clientWidth/1280,host.current.clientHeight/720);stage.current.style.transform=`scale(${scale})`};const ro=new ResizeObserver(resize);if(host.current)ro.observe(host.current);resize();return()=>ro.disconnect()},[]);
  const sample=sampleMicro20(time,controls,timing,issueControls,issueTiming,issueStart,liveProgress,inspecting?undefined:issueTimeline);
  return <main ref={editor} className="micro20-app" data-time={time} data-inspecting={inspecting} data-issue-start={issueStart}><div ref={host} className="micro20-stage-host"><div ref={stage} className="micro20-stage"><Micro20Scene sample={sample}/></div></div><aside className="micro20-toolbar">Trace analysis → radial issue discovery → established direct gather</aside><ExperimentPicker current="micro-20"/><DialRoot/><DialTimeline visible={!inspecting}/></main>;
};
