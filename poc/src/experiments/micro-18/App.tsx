import {createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ComponentType} from 'react';
import {DialRoot, DialStore, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {CLIP_KEYS as KEYS17} from '../micro-17/timeline';
import {livePlayback as liveMicro17, sampleMicro17} from '../micro-17/sample';
import {agentScreenPan, worldState as micro17WorldState} from '../micro-17/geometry';
import {CLIP_KEYS as KEYS16} from '../micro-16/timeline';
import {MICRO_15_TIMELINE} from '../micro-15/timeline';
import {FLOW_CLIP_KEYS, INTRODUCING_FLOW_1_TIMELINE} from '../introducing-flow-1/timeline';
import {chapterSchedule, sampleUltimate3} from './sample';
import {CHAPTER_IDS, CONCLUSION_STORAGE_MIGRATION_ID, FLOW_COVER_STORAGE_MIGRATION_ID, ISSUE_TIMING_STORAGE_MIGRATION_ID, SETTINGS_STORAGE_ID, ULTIMATE_2_TIMING_STORAGE_MIGRATION_ID, ULTIMATE_3_DEFAULTS, ultimate2Endpoint, migrateStoredFlowCover, migrateStoredIssueTimeline, migrateStoredSettings, migrateStoredUltimate2Timeline, normalizeSettings, type ChapterId, type ClipTiming, type Ultimate3Settings} from './settings';
import {Ultimate3Scene} from './Scene';
import {costTimelineConfig, liveFlowPreview, liveIssuesPreview, timelinePreviewSignature, ultimate2TimelineConfig} from './authoring';
import {authoredStageSize} from './layout';
import {useStreamRunAudio} from '../micro-17/use-stream-run-audio';
import {useUltimate3Music} from './use-ultimate3-music';
import {ultimate3AgentWindowSoundTiming, ultimate3CameraMoveWindows, ultimate3CheapAgentWhooshWindows, ultimate3CloudWhooshWindows, ultimate3DrawerOpeningTimes, ultimate3FlowDoorSoundTiming, ultimate3FlowNumberDropTimes, ultimate3FlowRatchetWindow, ultimate3FlowRevealWindow, ultimate3FlowTwinkleCues, ultimate3OpeningCloudPuffTimes} from './sound';
import type {DrawerOpeningEffect} from '../micro-17/stream-run-sound';
import {costClickTracks} from '../micro-16/cost-ratchet';
import {useRatchetClicks} from '../use-ratchet-clicks';
import {flattenUltimate3SoundMix, migrateUltimate3SoundStorage, SOUND_MIX_ID, ULTIMATE_3_SOUND_CONFIG} from './sound-controls';
import {useIssueTypingAudio} from './typing-audio';
import {useUltimate3ErrorChime} from './error-chime';

export const ULTIMATE3_PANEL_IDS = {
  main: 'micro-animation-18-main-timeline-v1', u2: 'micro-animation-18-ultimate2-timeline-v1', cost: 'micro-animation-18-cost-timeline-v1',
  flow: 'micro-animation-18-flow-timeline-v1', issues: 'micro-animation-18-issues-timeline-v1', conclusion: 'micro-animation-18-conclusion-timeline-v1',
  u2Motion: 'micro-animation-18-ultimate2-motion-v1', u2Clouds: 'micro-animation-18-ultimate2-clouds-v1', u2Warning: 'micro-animation-18-ultimate2-warning-v1',
  costControls: 'micro-animation-18-cost-controls-v1', flowClouds: 'micro-animation-18-flow-clouds-v1', flowDots: 'micro-animation-18-flow-dots-v1',
  flowRows: 'micro-animation-18-flow-rows-v1', flowCover: 'micro-animation-18-flow-cover-v1', issueControls: 'micro-animation-18-issues-controls-v1',
} as const;
export type Ultimate3PanelIds = {[K in keyof typeof ULTIMATE3_PANEL_IDS]: string};
const PanelIdsContext = createContext<Ultimate3PanelIds>(ULTIMATE3_PANEL_IDS);
export type Ultimate3AudioProps = {settings: Ultimate3Settings; globalTime: number; playing: boolean; inspecting: boolean};
export type Ultimate3Edition = {experimentId: string; settingsStorageId: string; panelIds: Ultimate3PanelIds; readSettings: () => Ultimate3Settings; mergeSettings?: (current: Ultimate3Settings, base: Ultimate3Settings, next: Ultimate3Settings) => Ultimate3Settings; Audio: ComponentType<Ultimate3AudioProps>};
const FLOW_RATCHET_DEFAULT_MIGRATION_ID = 'micro-animation-18-flow-ratchet-default-v2';
const migrateFlowRatchetDefault = () => {
  try {
    if (localStorage.getItem(FLOW_RATCHET_DEFAULT_MIGRATION_ID) === '1') return;
    const key = `dialkit:${SOUND_MIX_ID}`;
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
    const migrateStoredDefault = stored?.values?.flowRatchetInterval === .12;
    if (migrateStoredDefault) stored.values.flowRatchetInterval = .02;
    if (stored?.baseValues?.flowRatchetInterval === .12) stored.baseValues.flowRatchetInterval = .02;
    if (stored) localStorage.setItem(key, JSON.stringify(stored));
    if (migrateStoredDefault) DialStore.updateValues(SOUND_MIX_ID, {flowRatchetInterval: .02});
    localStorage.setItem(FLOW_RATCHET_DEFAULT_MIGRATION_ID, '1');
  } catch {}
};
const timelineClip = (at: number, duration: number) => ({at, duration, from: {progress: 0}, to: {progress: 1}, transition: {type: 'easing' as const, duration, ease: [0,0,1,1] as [number,number,number,number]}});
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const readSettings = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_ID) ?? 'null');
    const pendingConclusionMigration = localStorage.getItem(CONCLUSION_STORAGE_MIGRATION_ID) !== '1';
    const pendingFlowCoverMigration = localStorage.getItem(FLOW_COVER_STORAGE_MIGRATION_ID) !== '1';
    const pendingIssueTimingMigration = localStorage.getItem(ISSUE_TIMING_STORAGE_MIGRATION_ID) !== '1';
    const pendingUltimate2TimingMigration = localStorage.getItem(ULTIMATE_2_TIMING_STORAGE_MIGRATION_ID) !== '1';
    let migrated = pendingConclusionMigration ? migrateStoredSettings(stored) : stored;
    if (pendingFlowCoverMigration) migrated = migrateStoredFlowCover(migrated);
    if (pendingIssueTimingMigration) migrated = migrateStoredIssueTimeline(migrated);
    if (pendingUltimate2TimingMigration) migrated = migrateStoredUltimate2Timeline(migrated);
    const normalized = normalizeSettings(migrated);
    if (!same(stored, normalized)) localStorage.setItem(SETTINGS_STORAGE_ID, JSON.stringify(normalized));
    if (pendingConclusionMigration) localStorage.setItem(CONCLUSION_STORAGE_MIGRATION_ID, '1');
    if (pendingFlowCoverMigration) localStorage.setItem(FLOW_COVER_STORAGE_MIGRATION_ID, '1');
    if (pendingIssueTimingMigration) localStorage.setItem(ISSUE_TIMING_STORAGE_MIGRATION_ID, '1');
    if (pendingUltimate2TimingMigration) localStorage.setItem(ULTIMATE_2_TIMING_STORAGE_MIGRATION_ID, '1');
    return normalized;
  } catch {
    return normalizeSettings(ULTIMATE_3_DEFAULTS);
  }
};
const timingValues = (timing: Record<string, ClipTiming>, offset = 0) => Object.fromEntries(Object.entries(timing).flatMap(([key, value]) => [
  [`${key}.at`, value.at + offset], [`${key}.duration`, value.duration], ...value.transition ? [[`${key}.transition`, value.transition]] : [],
]));

/** Makes the serialized composition authoritative over DialKit's retained panel snapshots. */
function useDialSync(panels: Record<string, Record<string, unknown>>) {
  const signature = JSON.stringify(panels);
  const synced = useRef<string | undefined>(undefined);
  const [, refresh] = useReducer(value => value + 1, 0);
  const ready = synced.current === signature;
  useEffect(() => {
    for (const [id, values] of Object.entries(panels)) DialStore.updateValues(id, values as any);
    synced.current = signature;
    refresh();
  }, [signature]);
  return ready;
}
function useTransportHandoff(timeline: any, start: number, duration: number, globalTime: number, onTime: (time: number) => void, onPlaying: (playing: boolean) => void) {
  const local = globalTime - start;
  const handoff = useRef({target: Math.max(0, Math.min(duration, local)), waiting: true, preserveAtTarget: local < 0 || local > duration});
  useEffect(() => {timeline.pause(); timeline.seek(handoff.current.target); return () => onPlaying(false);}, []);
  useEffect(() => onPlaying(timeline.playing), [timeline.playing]);
  useEffect(() => {
    const atTarget = Math.abs(timeline.time - handoff.current.target) < .0001;
    if (handoff.current.waiting) {
      if (atTarget) handoff.current.waiting = false;
      return;
    }
    // A cross-chapter view switch clamps only the dock playhead. Keep rendering
    // the original global frame until the user actually moves this transport.
    if (handoff.current.preserveAtTarget && atTarget) return;
    handoff.current.preserveAtTarget = false;
    onTime(start + timeline.time);
  }, [timeline.time]);
}
const extractTiming = (timeline: any, keys: readonly string[]) => Object.fromEntries(keys.map(key => [key, {at: timeline[key].at, duration: timeline[key].duration, transition: timeline[key].transition}]));
type BridgeProps = {settings: Ultimate3Settings; globalTime: number; onTime: (time: number) => void; onPlaying: (playing: boolean) => void; onSettings: (settings: Ultimate3Settings) => void; onPreview?: (value: unknown) => void};

function MainTimeline({settings, globalTime, onTime, onPlaying, onSettings}: BridgeProps) {
  const IDS = useContext(PanelIdsContext);
  const schedule = chapterSchedule(settings);
  const config = useMemo(() => ({duration: schedule.at(-1)!.end, ...Object.fromEntries(schedule.map(s => [s.id, timelineClip(s.start, s.duration)]))}), [settings]);
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Ultimate 3 — Five chapters (fixed order, ripple)', config, {id: IDS.main, autoplay: false, loop: false, persist: true});
  useTransportHandoff(timeline, 0, schedule.at(-1)!.end, globalTime, onTime, onPlaying);
  const ready = useDialSync({[IDS.main]: Object.fromEntries(schedule.flatMap(s => [[`${s.id}.at`, s.start], [`${s.id}.duration`, s.duration]]))});
  const authoredSignature = JSON.stringify(CHAPTER_IDS.map(id => {const value=(timeline as any)[id]; return [value.at,value.duration];}));
  useEffect(() => {
    if (!ready) return;
    const allocations = Object.fromEntries(CHAPTER_IDS.map(id => [id, (timeline as any)[id].duration]));
    const next = normalizeSettings({...settings, allocations});
    const corrections: Record<string, number> = {};
    chapterSchedule(next).forEach(segment => {
      const current=(timeline as any)[segment.id];
      if(Math.abs(current.at-segment.start)>.0001) corrections[`${segment.id}.at`]=segment.start;
      if(Math.abs(current.duration-segment.duration)>.0001) corrections[`${segment.id}.duration`]=segment.duration;
    });
    if(Object.keys(corrections).length) DialStore.updateValues(IDS.main, corrections);
    if (!same(next, settings)) onSettings(next);
  }, [authoredSignature, ready]);
  return null;
}

function Detail17({settings, globalTime, onTime, onPlaying, onSettings, onPreview}: BridgeProps) {
  const IDS = useContext(PanelIdsContext);
  const start = chapterSchedule(settings)[0].start;
  const config = useMemo(() => ultimate2TimelineConfig(settings), [settings]);
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Ultimate 3 — 17 Ultimate 2 (native seconds)', config as any, {id: IDS.u2, autoplay: false, loop: false, persist: true});
  const motion = useDialKit('Ultimate 3 · 17 motion', {streamerSpeed:[settings.ultimate2.controls.streamerSpeed,240,1200,10],loaderSpeed:[settings.ultimate2.controls.loaderSpeed,0,6,.05],cloudEntrySpread:[settings.ultimate2.controls.cloudEntrySpread,0,1600,10],introCameraOffsetCells:[settings.ultimate2.controls.introCameraOffsetCells,-2,2,.05]}, {id:IDS.u2Motion,persist:true});
  const clouds = useDialKit('Ultimate 3 · 17 clouds', {openingCloudBackXOffset:[settings.ultimate2.controls.openingCloudBackXOffset,-1000,1000,1],openingCloudFrontXOffset:[settings.ultimate2.controls.openingCloudFrontXOffset,-1000,1000,1]}, {id:IDS.u2Clouds,persist:true});
  const warning = useDialKit('Ultimate 3 · 17 warning', {warningXOffset:[settings.ultimate2.controls.warningXOffset,-200,500,1],warningYOffset:[settings.ultimate2.controls.warningYOffset,-200,300,1]}, {id:IDS.u2Warning,persist:true});
  useTransportHandoff(timeline, start, settings.allocations.ultimate2, globalTime, onTime, onPlaying);
  const previewSignature = timelinePreviewSignature(timeline, KEYS17);
  useEffect(() => onPreview?.({chapter:'ultimate2', playback:liveMicro17(timeline as any)}), [previewSignature]);
  const ready = useDialSync({[IDS.u2]: timingValues(settings.ultimate2.timing), [IDS.u2Motion]: settings.ultimate2.controls, [IDS.u2Clouds]: settings.ultimate2.controls, [IDS.u2Warning]: settings.ultimate2.controls});
  useEffect(() => {if(!ready)return;const timing=extractTiming(timeline,KEYS17);const next=normalizeSettings({...settings,ultimate2:{...settings.ultimate2,timing}});if(!same(next,settings))onSettings(next);}, [JSON.stringify(KEYS17.map(k=>{const c=(timeline as any)[k];return[c.at,c.duration,c.transition]})),ready]);
  useEffect(() => {if(!ready)return;const controls={...motion,...clouds,...warning};const next=normalizeSettings({...settings,ultimate2:{...settings.ultimate2,controls}});if(!same(next,settings))onSettings(next);}, [JSON.stringify([motion,clouds,warning]),ready]);
  return null;
}

function Detail16({settings, globalTime, onTime, onPlaying, onSettings}: BridgeProps) {
  const IDS = useContext(PanelIdsContext);
  const start=chapterSchedule(settings)[1].start; const config=useMemo(()=>costTimelineConfig(settings),[settings]);
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline=useDialTimeline('Ultimate 3 — 16 Cost (native seconds)',config as any,{id:IDS.cost,autoplay:false,loop:false,persist:true});
  const controls=useDialKit('Ultimate 3 · 16 speed and smoke',{travelSpeed:[settings.cost.controls.travelSpeed,0,1800,10],purpleSpinnerSpeed:[settings.cost.controls.purpleSpinnerSpeed,0,10,.1],cheapSpinnerSpeed:[settings.cost.controls.cheapSpinnerSpeed,0,20,.1],cheapSpinnerStrokeWidth:[settings.cost.controls.cheapSpinnerStrokeWidth,0,12,.25],smokeSize:[settings.cost.controls.smokeSize,0,2,.05],smokeMinimumScale:[settings.cost.controls.smokeMinimumScale,0,1,.05]},{id:IDS.costControls,persist:true});
  useTransportHandoff(timeline,start,settings.allocations.cost,globalTime,onTime,onPlaying);
  const ready=useDialSync({[IDS.cost]:timingValues(settings.cost.timing),[IDS.costControls]:settings.cost.controls});
  useEffect(()=>{if(!ready)return;const timing=extractTiming(timeline,KEYS16);const next=normalizeSettings({...settings,cost:{...settings.cost,timing}});if(!same(next,settings))onSettings(next);},[JSON.stringify(KEYS16.map(k=>{const c=(timeline as any)[k];return[c.at,c.duration,c.transition]})),ready]);
  useEffect(()=>{if(!ready)return;const next=normalizeSettings({...settings,cost:{...settings.cost,controls}});if(!same(next,settings))onSettings(next);},[JSON.stringify(controls),ready]);
  return null;
}

function DetailFlow({settings,globalTime,onTime,onPlaying,onSettings,onPreview}:BridgeProps) {
  const IDS = useContext(PanelIdsContext);
  const start=chapterSchedule(settings)[2].start; const keys=FLOW_CLIP_KEYS.filter(k=>k!=='cloudReveal'); const entryEnd=settings.flow.entrySlide.at+settings.flow.entrySlide.duration;
  const shifted=Object.fromEntries(keys.map(k=>[k,{...INTRODUCING_FLOW_1_TIMELINE[k],...settings.flow.timing[k],at:entryEnd+settings.flow.timing[k].at}]));
  const config=useMemo(()=>({duration:settings.allocations.flow,entrySlide:{...timelineClip(settings.flow.entrySlide.at,settings.flow.entrySlide.duration),transition:settings.flow.entrySlide.transition},...shifted}),[settings]);
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline=useDialTimeline('Ultimate 3 — 13 Flow (native seconds)',config as any,{id:IDS.flow,autoplay:false,loop:false,persist:true});
  const position=useDialKit('Ultimate 3 · Flow clouds',{cloudYOffset:[settings.flow.controls.cloudYOffset,-500,500,1]},{id:IDS.flowClouds,persist:true});
  const dots=useDialKit('Ultimate 3 · Flow dots',{blueDotScale:[settings.flow.controls.blueDotScale,.25,5,.05]},{id:IDS.flowDots,persist:true});
  const rows=useDialKit('Ultimate 3 · Flow rows',{numberRowStagger:[settings.flow.controls.numberRowStagger,0,.25,.01]},{id:IDS.flowRows,persist:true});
  const cover=useDialKit('Ultimate 3 · Flow cover',{coverMotion:{type:'select',options:[{value:'top',label:'From top'},{value:'right',label:'From right'},{value:'split',label:'Split doors'}],default:settings.flow.controls.coverMotion},mutedGray:{type:'color',default:settings.flow.controls.mutedGray}},{id:IDS.flowCover,persist:true});
  useTransportHandoff(timeline,start,settings.allocations.flow,globalTime,onTime,onPlaying);
  const previewSignature=JSON.stringify([timelinePreviewSignature(timeline,['entrySlide',...keys]),settings.flow.entrySlide,settings.flow.timing]);
  useEffect(()=>onPreview?.({chapter:'flow',flow:liveFlowPreview(timeline,settings)}),[previewSignature]);
  const timelineSync={...timingValues({entrySlide:settings.flow.entrySlide}),...timingValues(settings.flow.timing,entryEnd)};
  const ready=useDialSync({[IDS.flow]:timelineSync,[IDS.flowClouds]:{cloudYOffset:settings.flow.controls.cloudYOffset},[IDS.flowDots]:{blueDotScale:settings.flow.controls.blueDotScale},[IDS.flowRows]:{numberRowStagger:settings.flow.controls.numberRowStagger},[IDS.flowCover]:{coverMotion:settings.flow.controls.coverMotion,mutedGray:settings.flow.controls.mutedGray}});
  useEffect(()=>{if(!ready)return;const authoredEnd=(timeline as any).entrySlide.at+(timeline as any).entrySlide.duration;const entrySlide={at:(timeline as any).entrySlide.at,duration:(timeline as any).entrySlide.duration,transition:(timeline as any).entrySlide.transition};if(Math.abs(authoredEnd-entryEnd)>.0001){DialStore.updateValues(IDS.flow,Object.fromEntries(keys.map(k=>[`${k}.at`,authoredEnd+settings.flow.timing[k].at])));const next=normalizeSettings({...settings,flow:{...settings.flow,entrySlide}});if(!same(next,settings))onSettings(next);return;}const timing=Object.fromEntries(keys.map(key=>[key,{...(extractTiming(timeline,[key]) as any)[key],at:Math.max(0,(timeline as any)[key].at-authoredEnd)}]));const next=normalizeSettings({...settings,flow:{...settings.flow,timing,entrySlide}});if(!same(next,settings))onSettings(next);},[JSON.stringify([[(timeline as any).entrySlide.at,(timeline as any).entrySlide.duration,(timeline as any).entrySlide.transition],...keys.map(k=>{const c=(timeline as any)[k];return[c.at,c.duration,c.transition]})]),ready]);
  useEffect(()=>{if(!ready)return;const controls={cloudYOffset:position.cloudYOffset,blueDotScale:dots.blueDotScale,numberRowStagger:rows.numberRowStagger,coverMotion:cover.coverMotion as 'top'|'right'|'split',mutedGray:cover.mutedGray};const next=normalizeSettings({...settings,flow:{...settings.flow,controls}});if(!same(next,settings))onSettings(next);},[JSON.stringify([position,dots,rows,cover]),ready]);
  return null;
}

function DetailIssues({settings,globalTime,onTime,onPlaying,onSettings,onPreview}:BridgeProps) {
  const IDS = useContext(PanelIdsContext);
  const start=chapterSchedule(settings)[3].start; const keys=Object.keys(MICRO_15_TIMELINE); const leadEnd=settings.issues.leadIn.at+settings.issues.leadIn.duration;
  const config=useMemo(()=>({duration:settings.allocations.issues,leadIn:timelineClip(settings.issues.leadIn.at,settings.issues.leadIn.duration),...Object.fromEntries(keys.map(k=>[k,{...(MICRO_15_TIMELINE as any)[k],...(settings.issues.timing as any)[k],at:leadEnd+(settings.issues.timing as any)[k].at}]))}),[settings]);
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline=useDialTimeline('Ultimate 3 — 15 Issues (native seconds)',config as any,{id:IDS.issues,autoplay:false,loop:false,persist:true});
  const controls=useDialKit('Ultimate 3 · 15 appearance and travel',{warningAppearanceDuration:[settings.issues.controls.warningAppearanceDuration,0,2,.05],travelDuration:[settings.issues.controls.travelDuration,0,10,.05],timelineDuration:[settings.issues.controls.timelineDuration,1,60,.1]},{id:IDS.issueControls,persist:true});
  useTransportHandoff(timeline,start,settings.allocations.issues,globalTime,onTime,onPlaying);
  const previewSignature=timelinePreviewSignature(timeline,keys);
  useEffect(()=>onPreview?.({chapter:'issues',sample:liveIssuesPreview(timeline,settings)}),[previewSignature]);
  const ready=useDialSync({[IDS.issues]:{...timingValues({leadIn:settings.issues.leadIn}),...timingValues(settings.issues.timing as any,leadEnd)},[IDS.issueControls]:settings.issues.controls});
  useEffect(()=>{if(!ready)return;const authoredEnd=(timeline as any).leadIn.at+(timeline as any).leadIn.duration;const leadIn={at:(timeline as any).leadIn.at,duration:(timeline as any).leadIn.duration,transition:(timeline as any).leadIn.transition};if(Math.abs(authoredEnd-leadEnd)>.0001){DialStore.updateValues(IDS.issues,Object.fromEntries(keys.map(k=>[`${k}.at`,authoredEnd+(settings.issues.timing as any)[k].at])));const next=normalizeSettings({...settings,issues:{...settings.issues,leadIn}});if(!same(next,settings))onSettings(next);return;}const timing=Object.fromEntries(keys.map(key=>[key,{at:Math.max(0,(timeline as any)[key].at-authoredEnd),duration:(timeline as any)[key].duration}]));const next=normalizeSettings({...settings,issues:{...settings.issues,timing,leadIn}});if(!same(next,settings))onSettings(next);},[JSON.stringify([[(timeline as any).leadIn.at,(timeline as any).leadIn.duration],...keys.map(k=>{const c=(timeline as any)[k];return[c.at,c.duration]})]),ready]);
  useEffect(()=>{if(!ready)return;const next=normalizeSettings({...settings,issues:{...settings.issues,controls}});if(!same(next,settings))onSettings(next);},[JSON.stringify(controls),ready]);
  return null;
}

function DetailConclusion({settings,globalTime,onTime,onPlaying,onSettings}:BridgeProps) {
  const IDS = useContext(PanelIdsContext);
  const start=chapterSchedule(settings)[4].start; const config=useMemo(()=>({duration:settings.allocations.conclusion,placeholder:timelineClip(settings.conclusion.placeholder.at,settings.conclusion.placeholder.duration),logo:timelineClip(settings.conclusion.logo.at,settings.conclusion.logo.duration)}),[settings]);
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline=useDialTimeline('Ultimate 3 — Conclusion (native seconds)',config,{id:IDS.conclusion,autoplay:false,loop:false,persist:true});
  useTransportHandoff(timeline,start,settings.allocations.conclusion,globalTime,onTime,onPlaying);
  const ready=useDialSync({[IDS.conclusion]:timingValues(settings.conclusion)});
  useEffect(()=>{if(!ready)return;const logoAt=timeline.placeholder.at+timeline.placeholder.duration;if(Math.abs(timeline.logo.at-logoAt)>.0001)DialStore.updateValues(IDS.conclusion,{'logo.at':logoAt});const conclusion={placeholder:{at:timeline.placeholder.at,duration:timeline.placeholder.duration},logo:{at:logoAt,duration:timeline.logo.duration}};const next=normalizeSettings({...settings,conclusion});if(!same(next,settings))onSettings(next);},[timeline.placeholder.at,timeline.placeholder.duration,timeline.logo.at,timeline.logo.duration,ready]);
  return null;
}

const Details={ultimate2:Detail17,cost:Detail16,flow:DetailFlow,issues:DetailIssues,conclusion:DetailConclusion};
function LegacyUltimate3Audio({settings, globalTime, playing, inspecting}: Ultimate3AudioProps) {
  const soundMix=flattenUltimate3SoundMix(useDialKit('Ultimate 3 · Sound',ULTIMATE_3_SOUND_CONFIG,{id:SOUND_MIX_ID,persist:true}));
  const schedule=chapterSchedule(settings); const streamRun=settings.ultimate2.timing.streamRun; useStreamRunAudio(globalTime,!inspecting&&playing,{at:schedule[0].start+streamRun.at,duration:streamRun.duration},{...soundMix,masterGain:soundMix.masterVolume,streamEnd:schedule[0].start+Math.min(schedule[0].duration,ultimate2Endpoint(settings)),streamPanAt:t=>agentScreenPan(micro17WorldState(sampleMicro17(t-schedule[0].start,settings.ultimate2.timing),settings.ultimate2.controls))},ultimate3CloudWhooshWindows(settings),ultimate3DrawerOpeningTimes(settings),soundMix.drawerOpening as DrawerOpeningEffect,ultimate3CameraMoveWindows(settings),ultimate3FlowRevealWindow(settings,soundMix.flowRevealTimeToPeak+soundMix.flowRevealTail),ultimate3FlowRatchetWindow(settings),soundMix.flowRatchetInterval,ultimate3FlowTwinkleCues(settings,soundMix.twinkleTimeToPeak,soundMix.twinkleTail,soundMix.twinkleDensity),Number(soundMix.twinkleBase),ultimate3OpeningCloudPuffTimes(settings),ultimate3AgentWindowSoundTiming(settings),ultimate3FlowNumberDropTimes(settings),ultimate3FlowDoorSoundTiming(settings),ultimate3CheapAgentWhooshWindows(settings));
  useRatchetClicks(globalTime,!inspecting&&playing,costClickTracks(settings.cost.timing,settings.cost.controls,schedule[1].start,settings.pacing.costTrimEnd),soundMix.costRatchetVolume * soundMix.masterVolume);
  useUltimate3Music(globalTime,!inspecting&&playing,settings,soundMix.musicVolume,soundMix.masterVolume);
  useIssueTypingAudio(globalTime,!inspecting&&playing,settings,soundMix.typingVolume,soundMix.masterVolume);
  useUltimate3ErrorChime(globalTime,!inspecting&&playing,settings,soundMix.errorToneVolume,soundMix.masterVolume);
  return null;
}
const ORIGINAL_EDITION: Ultimate3Edition = {experimentId:'micro-18', settingsStorageId:SETTINGS_STORAGE_ID, panelIds:ULTIMATE3_PANEL_IDS, readSettings:()=>{migrateFlowRatchetDefault();migrateUltimate3SoundStorage();return readSettings();}, Audio:LegacyUltimate3Audio};
export const Micro18App=({edition=ORIGINAL_EDITION}: {edition?: Ultimate3Edition})=>{
  const AudioComponent=edition.Audio;
  const editor=useRef<HTMLElement>(null); const stageHost=useRef<HTMLDivElement>(null); const stage=useRef<HTMLDivElement>(null); const [settings,setSettingsState]=useState(()=>edition.readSettings()); const query=new URLSearchParams(location.search); const requested=Number(query.get('time')); const inspecting=query.has('time')&&Number.isFinite(requested)&&requested>=0; const [globalTime,setGlobalTime]=useState(inspecting?requested:0); const [view,setView]=useState<'main'|ChapterId>('main'); const [json,setJson]=useState(''); const [live,setLive]=useState<any>(null); const [playing,setPlaying]=useState(false);
  const setSettings=(next:Ultimate3Settings)=>{
    const save=(value:Ultimate3Settings)=>{try{localStorage.setItem(edition.settingsStorageId,JSON.stringify(value));}catch{}return value;};
    if(edition.mergeSettings)setSettingsState(current=>save(edition.mergeSettings!(current,settings,next)));
    else {setSettingsState(next);save(next);}
  };
  useEffect(()=>{let dock:Element|null=null;const update=()=>{const rect=dock?.getBoundingClientRect();editor.current?.style.setProperty('--micro18-timeline-height',`${rect&&rect.height>0?innerHeight-rect.top+6:0}px`)};const resize=new ResizeObserver(update);const attach=()=>{const next=document.querySelector('.dialkit-timeline');if(next===dock)return;resize.disconnect();dock=next;if(dock)resize.observe(dock);update()};const mount=new MutationObserver(attach);mount.observe(document.body,{childList:true,subtree:true,attributes:true});attach();addEventListener('resize',update);return()=>{mount.disconnect();resize.disconnect();removeEventListener('resize',update)}},[]);
  useEffect(()=>{const host=stageHost.current!;const update=()=>{const size=authoredStageSize(host.clientWidth,host.clientHeight);const node=stage.current!;node.style.width=`${size.width}px`;node.style.height=`${size.height}px`;node.style.setProperty('--micro18-scale',String(size.scale));};const observer=new ResizeObserver(update);observer.observe(host);update();return()=>observer.disconnect()},[]);
  let sample=sampleUltimate3(inspecting?requested:globalTime,settings);if(!inspecting&&view==='ultimate2'&&live?.chapter==='ultimate2'&&sample.chapter==='ultimate2')sample={...sample,ultimate2:live.playback};if(!inspecting&&view==='flow'&&live?.chapter==='flow'&&sample.chapter==='flow')sample={...sample,flow:{...sample.flow,...live.flow}};if(!inspecting&&view==='issues'&&live?.chapter==='issues'&&sample.chapter==='issues'&&sample.issues)sample={...sample,issues:{...sample.issues,sample:live.sample}};const Bridge=view==='main'?MainTimeline:Details[view];
  return <PanelIdsContext.Provider value={edition.panelIds}><main data-edition={edition.experimentId} ref={editor} className="micro18-app" data-time={sample.time} data-inspecting={inspecting}><div ref={stageHost} className="micro18-stage-host"><div ref={stage} className="micro18-stage"><div className="micro18-authored"><Ultimate3Scene sample={sample} settings={settings}/></div></div></div><div className="micro18-toolbar"><nav className="micro18-nav" aria-label="Ultimate 3 timeline view"><button data-active={view==='main'} onClick={()=>setView('main')}>Main</button>{chapterSchedule(settings).map(s=><button key={s.id} data-active={view===s.id} onClick={()=>setView(s.id)} title="Switch timeline without changing the current global frame">{s.label}</button>)}</nav><details className="micro18-settings"><summary>Settings JSON</summary><textarea aria-label="Ultimate 3 settings JSON" value={json} onChange={e=>setJson(e.currentTarget.value)}/><button onClick={()=>setJson(JSON.stringify(settings,null,2))}>Export</button><button onClick={()=>{try{setSettings(normalizeSettings(JSON.parse(json)))}catch{}}}>Apply</button></details><AudioComponent settings={settings} globalTime={globalTime} playing={playing} inspecting={inspecting}/></div><ExperimentPicker current={edition.experimentId}/>{!inspecting&&<Bridge key={view} settings={settings} globalTime={globalTime} onTime={setGlobalTime} onPlaying={setPlaying} onSettings={setSettings} onPreview={setLive}/>}<DialRoot/><DialTimeline visible={!inspecting}/></main></PanelIdsContext.Provider>;
};
