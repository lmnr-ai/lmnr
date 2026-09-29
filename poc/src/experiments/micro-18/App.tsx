import {installMicro22AuthoringCompatibility, micro22TimelineState, micro22PostludeState} from '../micro-22/authoring';
import {sampleIssues} from './sample';
import {issueEntryEnd, issuePostludeOffset} from './settings';
import {createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ComponentType} from 'react';
import {DialRoot, DialStore, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {CLIP_KEYS as KEYS17} from '../micro-17/timeline';
import {livePlayback as liveMicro17, sampleMicro17} from '../micro-17/sample';
import {agentScreenPan, worldState as micro17WorldState} from '../micro-17/geometry';
import {CLIP_KEYS as KEYS16} from '../micro-16/timeline';
import {SPINNER_SPEED_KEYS} from '../micro-20/timeline';
import {installMicro20AuthoringCompatibility, ULTIMATE3_ISSUES_TIMELINE_ID} from '../micro-20/authoring';
import {migrateIssues3Storage} from './issues3-persistence';
import {chapterSchedule, issueHandoffValidation, sampleUltimate3} from './sample';
import {CHAPTER_IDS, CONCLUSION_STORAGE_MIGRATION_ID, FLOW_COVER_STORAGE_MIGRATION_ID, ISSUE_TIMING_STORAGE_MIGRATION_ID, SETTINGS_STORAGE_ID, ULTIMATE_2_TIMING_STORAGE_MIGRATION_ID, ULTIMATE_3_DEFAULTS, ultimate2Endpoint, migrateStoredFlowCover, migrateStoredIssueTimeline, migrateStoredSettings, migrateStoredUltimate2Timeline, normalizeSettings, type ChapterId, type ClipTiming, type Ultimate3Settings} from './settings';
import {Ultimate3Scene} from './Scene';
import {observeUltimate3TransportJump} from './transport-seeks';
import {VOICEOVER_PHRASES} from './voiceover-phrases';
import {ULTIMATE2_CLOUD_KEY, ultimate2CloudTimelineConfig, ultimate2CloudTimelineValues, settingsFromUltimate2CloudTimeline, voiceoverTimelineConfig, voiceoverTimelineValues, voiceoverTimelineSignature, settingsFromVoiceoverTimeline, CONCLUSION_TIMELINE_KEYS, conclusionTimelineConfig, conclusionTimelineValues, settingsFromConclusionTimeline, costTimelineConfig, flowTimelineConfig, flowTimelineSettings, liveFlowPreview, issuesTimelineKeys, ISSUES_TIMELINE_KEYS, issuesTimelineConfig, issuesTimelineValues, settingsFromIssuesTimeline, timelinePreviewSignature, ultimate2TimelineConfig} from './authoring';
import {authoredStageSize} from './layout';
import {useStreamRunAudio} from '../micro-17/use-stream-run-audio';
import {useUltimate3Music} from './use-ultimate3-music';
import {useArabesqueAudio} from './use-arabesque-audio';
import {ultimate3AgentWindowSoundTiming, ultimate3CameraMoveWindows, ultimate3CheapAgentWhooshWindows, ultimate3CloudWhooshWindows, ultimate3DrawerOpeningTimes, ultimate3FlowDoorSoundTiming, ultimate3FlowNumberDropTimes, ultimate3FlowRatchetWindow, ultimate3FlowRevealWindow, ultimate3FlowTwinkleCues, ultimate3OpeningCloudPuffTimes} from './sound';
import type {DrawerOpeningEffect} from '../micro-17/stream-run-sound';
import {costClickTracks} from '../micro-16/cost-ratchet';
import {useRatchetClicks} from '../use-ratchet-clicks';
import {flattenUltimate3SoundMix, migrateUltimate3SoundStorage, SOUND_MIX_ID, ULTIMATE_3_SOUND_CONFIG} from './sound-controls';
import {useIssueTypingAudio} from './typing-audio';
import {useUltimate3ErrorChime} from './error-chime';

export const ULTIMATE3_PANEL_IDS = {
  main: 'micro-animation-18-main-timeline-v1', u2: 'micro-animation-18-ultimate2-timeline-v1', cost: 'micro-animation-18-cost-timeline-v1',
  flow: 'micro-animation-18-flow-timeline-v1', issues: ULTIMATE3_ISSUES_TIMELINE_ID, conclusion: 'micro-animation-18-conclusion-timeline-v1',
  u2Motion: 'micro-animation-18-ultimate2-motion-v1', u2Clouds: 'micro-animation-18-ultimate2-clouds-v1', u2Warning: 'micro-animation-18-ultimate2-warning-v1',
  costControls: 'micro-animation-18-cost-controls-v1', flowClouds: 'micro-animation-18-flow-clouds-v1', flowDots: 'micro-animation-18-flow-dots-v1',
  flowRows: 'micro-animation-18-flow-rows-v1', flowCover: 'micro-animation-18-flow-cover-v1', issueControls: 'micro-animation-18-issues-controls-v1',
} as const;
export type Ultimate3PanelIds = {[K in keyof typeof ULTIMATE3_PANEL_IDS]: string};
const PanelIdsContext = createContext<Ultimate3PanelIds>(ULTIMATE3_PANEL_IDS);
export type Ultimate3AudioProps = {settings: Ultimate3Settings; globalTime: number; playing: boolean; inspecting: boolean; seekGeneration: number};
export type Ultimate3Edition = {experimentId: string; settingsStorageId: string; panelIds: Ultimate3PanelIds; readSettings: () => Ultimate3Settings; editableVoiceover?: boolean; normalizeSettings?: (input: unknown) => Ultimate3Settings; mergeSettings?: (current: Ultimate3Settings, base: Ultimate3Settings, next: Ultimate3Settings) => Ultimate3Settings; Audio: ComponentType<Ultimate3AudioProps>};
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
    migrateIssues3Storage(localStorage);
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
function useTransportHandoff(timeline: any, start: number, duration: number, globalTime: number, onTime: (time: number) => void, onPlaying: (playing: boolean) => void, panelId: string, onSeek?: (time: number) => void) {
  const local = globalTime - start;
  const handoff = useRef({target: Math.max(0, Math.min(duration, local)), waiting: true, preserveAtTarget: local < 0 || local > duration});
  const seekHandler = useRef(onSeek ? (time: number) => onSeek(start + time) : undefined);
  seekHandler.current = onSeek ? (time: number) => onSeek(start + time) : undefined;
  useEffect(() => {timeline.pause(); timeline.seek(handoff.current.target); return () => onPlaying(false);}, []);
  // Mount after the initial handoff seek; cleanup occurs on view switches and StrictMode replays.
  useEffect(() => onSeek ? observeUltimate3TransportJump(panelId, time => seekHandler.current?.(time)) : undefined, [panelId, !!onSeek]);
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
type BridgeProps = {settings: Ultimate3Settings; globalTime: number; onTime: (time: number) => void; onPlaying: (playing: boolean) => void; onSettings: (settings: Ultimate3Settings) => void; onPreview?: (value: unknown) => void; onSeek?: (time: number) => void};

function MainTimeline({settings, globalTime, onTime, onPlaying, onSettings, onPreview, onSeek}: BridgeProps) {
  const IDS = useContext(PanelIdsContext);
  const schedule = chapterSchedule(settings);
  const config = useMemo(() => ({duration: schedule.at(-1)!.end, ...Object.fromEntries(schedule.map(s => [s.id, timelineClip(s.start, s.duration)])), ...ultimate2CloudTimelineConfig(settings), ...voiceoverTimelineConfig(settings)}), [settings]);
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Ultimate 3 — Five chapters (fixed order, ripple)', config, {id: IDS.main, autoplay: false, loop: false, persist: true});
  useTransportHandoff(timeline, 0, schedule.at(-1)!.end, globalTime, onTime, onPlaying, IDS.main, onSeek);
  const ready = useDialSync({[IDS.main]: {...Object.fromEntries(schedule.flatMap(s => [[`${s.id}.at`, s.start], [`${s.id}.duration`, s.duration]])), ...voiceoverTimelineValues(settings), ...ultimate2CloudTimelineValues(settings)}});
  const cloudPreviewSignature = timelinePreviewSignature(timeline, [ULTIMATE2_CLOUD_KEY]);
  useEffect(() => {const progress = timeline[ULTIMATE2_CLOUD_KEY].current?.progress;if (ready && progress !== undefined) onPreview?.({chapter: 'ultimate2CloudEnter', progress});}, [cloudPreviewSignature, ready]);
  const authoredSignature = JSON.stringify([CHAPTER_IDS.map(id => {const value=(timeline as any)[id]; return [value.at,value.duration];}),
    settings.voiceover ? voiceoverTimelineSignature(timeline) : null,
    ['at', 'duration', 'transition', 'from', 'to'].map(key => (timeline[ULTIMATE2_CLOUD_KEY] as any)[key])]);
  useEffect(() => {
    if (!ready) return;
    const allocations = Object.fromEntries(CHAPTER_IDS.map(id => [id, (timeline as any)[id].duration]));
    const next = settingsFromUltimate2CloudTimeline(timeline, settingsFromVoiceoverTimeline(timeline, normalizeSettings({...settings, allocations})));
    const corrections: Record<string, any> = {[`${ULTIMATE2_CLOUD_KEY}.from.progress`]: 0, [`${ULTIMATE2_CLOUD_KEY}.to.progress`]: 1};
    if (timeline[ULTIMATE2_CLOUD_KEY].duration !== next.ultimate2.timing.cloudEnter.duration) corrections[`${ULTIMATE2_CLOUD_KEY}.duration`] = next.ultimate2.timing.cloudEnter.duration;
    chapterSchedule(next).forEach(segment => {
      const current=(timeline as any)[segment.id];
      if(Math.abs(current.at-segment.start)>.0001) corrections[`${segment.id}.at`]=segment.start;
      if(Math.abs(current.duration-segment.duration)>.0001) corrections[`${segment.id}.duration`]=segment.duration;
    });
    if (next.voiceover) {
      const neutral = voiceoverTimelineValues(next);
      for (const [path, value] of Object.entries(neutral)) {
        if (!path.endsWith('.at') && !path.endsWith('.duration')) corrections[path] = value as any;
      }
    }
    if(Object.keys(corrections).length) DialStore.updateValues(IDS.main, corrections);
    if (!same(next, settings)) onSettings(next);
  }, [authoredSignature, ready]);
  return null;
}

function Detail17({settings, globalTime, onTime, onPlaying, onSettings, onPreview, onSeek}: BridgeProps) {
  const IDS = useContext(PanelIdsContext);
  const start = chapterSchedule(settings)[0].start;
  const config = useMemo(() => ({...ultimate2TimelineConfig(settings), ...voiceoverTimelineConfig(settings, true)}), [settings]);
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Ultimate 3 — 17 Ultimate 2 (native seconds)', config as any, {id: IDS.u2, autoplay: false, loop: false, persist: true});
  const motion = useDialKit('Ultimate 3 · 17 motion', {streamerSpeed:[settings.ultimate2.controls.streamerSpeed,240,1200,10],loaderSpeed:[settings.ultimate2.controls.loaderSpeed,0,6,.05],cloudEntrySpread:[settings.ultimate2.controls.cloudEntrySpread,0,1600,10],introCameraOffsetCells:[settings.ultimate2.controls.introCameraOffsetCells,-2,2,.05]}, {id:IDS.u2Motion,persist:true});
  const clouds = useDialKit('Ultimate 3 · 17 clouds', {openingCloudBackXOffset:[settings.ultimate2.controls.openingCloudBackXOffset,-1000,1000,1],openingCloudFrontXOffset:[settings.ultimate2.controls.openingCloudFrontXOffset,-1000,1000,1]}, {id:IDS.u2Clouds,persist:true});
  const warning = useDialKit('Ultimate 3 · 17 warning', {warningXOffset:[settings.ultimate2.controls.warningXOffset,-200,500,1],warningYOffset:[settings.ultimate2.controls.warningYOffset,-200,300,1]}, {id:IDS.u2Warning,persist:true});
  useTransportHandoff(timeline, start, settings.allocations.ultimate2, globalTime, onTime, onPlaying, IDS.u2, onSeek);
  const previewSignature = timelinePreviewSignature(timeline, KEYS17);
  useEffect(() => onPreview?.({chapter:'ultimate2', playback:liveMicro17(timeline as any)}), [previewSignature]);
  const ready = useDialSync({[IDS.u2]: {...timingValues(settings.ultimate2.timing), ...voiceoverTimelineValues(settings, true)}, [IDS.u2Motion]: settings.ultimate2.controls, [IDS.u2Clouds]: settings.ultimate2.controls, [IDS.u2Warning]: settings.ultimate2.controls});
  useEffect(() => {if(!ready)return;const timing=extractTiming(timeline,KEYS17);const next=settingsFromVoiceoverTimeline(timeline,normalizeSettings({...settings,ultimate2:{...settings.ultimate2,timing}}),true);
    if (next.voiceover) DialStore.updateValues(IDS.u2, Object.fromEntries(Object.entries(voiceoverTimelineValues(next,true)).filter(([path]) => !path.endsWith('.at') && !path.endsWith('.duration'))) as any);
    if(!same(next,settings))onSettings(next);}, [JSON.stringify(KEYS17.map(k=>{const c=(timeline as any)[k];return[c.at,c.duration,c.transition]})),settings.voiceover ? voiceoverTimelineSignature(timeline,true) : null,ready]);
  useEffect(() => {if(!ready)return;const controls={...motion,...clouds,...warning};const next=normalizeSettings({...settings,ultimate2:{...settings.ultimate2,controls}});if(!same(next,settings))onSettings(next);}, [JSON.stringify([motion,clouds,warning]),ready]);
  return null;
}

function Detail16({settings, globalTime, onTime, onPlaying, onSettings, onSeek}: BridgeProps) {
  const IDS = useContext(PanelIdsContext);
  const start=chapterSchedule(settings)[1].start; const config=useMemo(()=>costTimelineConfig(settings),[settings]);
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline=useDialTimeline('Ultimate 3 — 16 Cost (native seconds)',config as any,{id:IDS.cost,autoplay:false,loop:false,persist:true});
  const controls=useDialKit('Ultimate 3 · 16 speed and smoke',{travelSpeed:[settings.cost.controls.travelSpeed,0,1800,10],purpleSpinnerSpeed:[settings.cost.controls.purpleSpinnerSpeed,0,10,.1],cheapSpinnerSpeed:[settings.cost.controls.cheapSpinnerSpeed,0,20,.1],cheapSpinnerStrokeWidth:[settings.cost.controls.cheapSpinnerStrokeWidth,0,12,.25],smokeSize:[settings.cost.controls.smokeSize,0,2,.05],smokeMinimumScale:[settings.cost.controls.smokeMinimumScale,0,1,.05]},{id:IDS.costControls,persist:true});
  useTransportHandoff(timeline,start,settings.allocations.cost,globalTime,onTime,onPlaying,IDS.cost,onSeek);
  const ready=useDialSync({[IDS.cost]:timingValues(settings.cost.timing),[IDS.costControls]:settings.cost.controls});
  useEffect(()=>{if(!ready)return;const timing=extractTiming(timeline,KEYS16);const next=normalizeSettings({...settings,cost:{...settings.cost,timing}});if(!same(next,settings))onSettings(next);},[JSON.stringify(KEYS16.map(k=>{const c=(timeline as any)[k];return[c.at,c.duration,c.transition]})),ready]);
  useEffect(()=>{if(!ready)return;const next=normalizeSettings({...settings,cost:{...settings.cost,controls}});if(!same(next,settings))onSettings(next);},[JSON.stringify(controls),ready]);
  return null;
}

function DetailFlow({settings,globalTime,onTime,onPlaying,onSettings,onPreview,onSeek}:BridgeProps) {
  const baseIds = useContext(PanelIdsContext);
  const sequel = settings.flow.sourceVersion === 21;
  // Isolate source21 bars from saved source13 panel values, not from authored settings.
  const IDS = {...baseIds, flow: baseIds.flow + (sequel ? '-source21' : ''), flowRows: baseIds.flowRows + (sequel ? '-source21' : '')};
  const {keys, timing: activeTiming} = flowTimelineSettings(settings);
  const timingKey = sequel ? 'timing21' : 'timing';
  const rowKey = sequel ? 'beadStaggerSeconds' : 'numberRowStagger';
  const rowValue = sequel ? settings.flow.controls.beadStaggerSeconds ?? .11 : settings.flow.controls.numberRowStagger;
  const start=chapterSchedule(settings)[2].start; const entryEnd=settings.flow.entrySlide.at+settings.flow.entrySlide.duration;
  const config=useMemo(()=>flowTimelineConfig(settings),[settings]);
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline=useDialTimeline(`Ultimate 3 — ${sequel ? '21 Flow-1 2' : '13 Flow'} (native seconds)`,config as any,{id:IDS.flow,autoplay:false,loop:false,persist:true});
  const position=useDialKit('Ultimate 3 · Flow clouds',{cloudYOffset:[settings.flow.controls.cloudYOffset,-500,500,1]},{id:IDS.flowClouds,persist:true});
  const dots=useDialKit('Ultimate 3 · Flow dots',{blueDotScale:[settings.flow.controls.blueDotScale,.25,5,.05]},{id:IDS.flowDots,persist:true});
  const rows=useDialKit(sequel ? 'Ultimate 3 · Bead stagger' : 'Ultimate 3 · Flow rows',{[rowKey]:[rowValue,0,sequel ? .5 : .25,.01]},{id:IDS.flowRows,persist:true});
  const cover=useDialKit('Ultimate 3 · Flow cover',{coverMotion:{type:'select',options:[{value:'top',label:'From top'},{value:'right',label:'From right'},{value:'split',label:'Split doors'}],default:settings.flow.controls.coverMotion},mutedGray:{type:'color',default:settings.flow.controls.mutedGray}},{id:IDS.flowCover,persist:true});
  useTransportHandoff(timeline,start,settings.allocations.flow,globalTime,onTime,onPlaying,IDS.flow,onSeek);
  const previewSignature=JSON.stringify([timelinePreviewSignature(timeline,['entrySlide',...keys]),settings.flow.entrySlide,activeTiming]);
  useEffect(()=>onPreview?.({chapter:'flow',flow:liveFlowPreview(timeline,settings)}),[previewSignature]);
  const timelineSync={...timingValues({entrySlide:settings.flow.entrySlide}),...timingValues(activeTiming,entryEnd),
    ...(sequel ? Object.fromEntries(keys.flatMap(key => [[`${key}.from.progress`, activeTiming[key].from?.progress ?? 0], [`${key}.to.progress`, activeTiming[key].to?.progress ?? 1]])) : {})};
  const ready=useDialSync({[IDS.flow]:timelineSync,[IDS.flowClouds]:{cloudYOffset:settings.flow.controls.cloudYOffset},[IDS.flowDots]:{blueDotScale:settings.flow.controls.blueDotScale},[IDS.flowRows]:{[rowKey]:rowValue},[IDS.flowCover]:{coverMotion:settings.flow.controls.coverMotion,mutedGray:settings.flow.controls.mutedGray}});
  useEffect(()=>{if(!ready)return;const authoredEnd=(timeline as any).entrySlide.at+(timeline as any).entrySlide.duration;const entrySlide={...(extractTiming(timeline,['entrySlide']) as any).entrySlide};if(Math.abs(authoredEnd-entryEnd)>.0001){DialStore.updateValues(IDS.flow,Object.fromEntries(keys.map(k=>[`${k}.at`,authoredEnd+activeTiming[k].at])));const next=normalizeSettings({...settings,flow:{...settings.flow,entrySlide}});if(!same(next,settings))onSettings(next);return;}const timing=Object.fromEntries(keys.map(key=>[key,{...(extractTiming(timeline,[key]) as any)[key],from:(timeline as any)[key].from,to:(timeline as any)[key].to,at:Math.max(0,(timeline as any)[key].at-authoredEnd)}]));const next=normalizeSettings({...settings,flow:{...settings.flow,[timingKey]:timing,entrySlide}});if(!same(next,settings))onSettings(next);},[JSON.stringify([[(timeline as any).entrySlide.at,(timeline as any).entrySlide.duration,(timeline as any).entrySlide.transition],...keys.map(k=>{const c=(timeline as any)[k];return[c.at,c.duration,c.transition,c.from,c.to]})]),ready]);
  useEffect(()=>{if(!ready)return;const controls={...settings.flow.controls,cloudYOffset:position.cloudYOffset,blueDotScale:dots.blueDotScale,[rowKey]:rows[rowKey],coverMotion:cover.coverMotion as 'top'|'right'|'split',mutedGray:cover.mutedGray};const next=normalizeSettings({...settings,flow:{...settings.flow,controls}});if(!same(next,settings))onSettings(next);},[JSON.stringify([position,dots,rows,cover]),ready]);
  return null;
}

function DetailIssues({settings,globalTime,onTime,onPlaying,onSettings,onSeek}:BridgeProps) {
  const IDS = useContext(PanelIdsContext);
  const start = chapterSchedule(settings)[3].start;
  const config = useMemo(() => issuesTimelineConfig(settings), [settings]);
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Ultimate 3 — 20 Issue clusters 3 (earliest starts, chapter seconds)', config as any, {id: IDS.issues, autoplay: false, loop: false, persist: true});
  const controls = useDialKit('Ultimate 3 · Issues postlude', {travelDuration: [settings.issues.controls.travelDuration, 0, 10, .05], timelineDuration: [settings.issues.controls.timelineDuration, 1, 60, .1]}, {id: IDS.issueControls, persist: true});
  const preludeControls = useDialKit('Ultimate 3 · Issues prelude', {
    ...Object.fromEntries(SPINNER_SPEED_KEYS.map(key => [key, [settings.issues.preludeControls[key], 0, 10, .1]])),
    radialCircleRadius: [settings.issues.preludeControls.radialCircleRadius, 0, 1400, 1], radialSoftness: [settings.issues.preludeControls.radialSoftness, 0, 1, .05],
    timelineDuration: [settings.issues.preludeControls.timelineDuration, 1, 120, .1], issueStart: [settings.issues.issueStart, 0, 60, .05],
  } as any, {id: `${IDS.issueControls}-prelude-v1`, persist: true});
  useTransportHandoff(timeline, start, settings.allocations.issues, globalTime, onTime, onPlaying, IDS.issues, onSeek);
  const ready = useDialSync({[IDS.issues]: issuesTimelineValues(settings), [IDS.issueControls]: settings.issues.controls,
    [`${IDS.issueControls}-prelude-v1`]: {...settings.issues.preludeControls, issueStart: settings.issues.issueStart}});
  const signature = timelinePreviewSignature(timeline, ISSUES_TIMELINE_KEYS);
  useEffect(() => {if (!ready) return; const next = settingsFromIssuesTimeline(timeline, settings); if (!same(next, settings)) onSettings(next);}, [signature, ready]);
  useEffect(() => {if (!ready) return; const next = normalizeSettings({...settings, issues: {...settings.issues,
    controls: {...settings.issues.controls, ...controls}, preludeControls, issueStart: (preludeControls as any).issueStart}});
    if (!same(next, settings)) onSettings(next);}, [JSON.stringify([controls, preludeControls]), ready]);
  return null;
}

function DetailIssues22({settings, globalTime, onTime, onPlaying, onSettings, onPreview, onSeek}: BridgeProps) {
  const base = useContext(PanelIdsContext), id = `${base.issues}-source22`, controlId = `${base.issueControls}-source22`;
  installMicro22AuthoringCompatibility(id, 'report_');
  const config = useMemo(() => issuesTimelineConfig(settings), [settings]);
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Ultimate 3 — 22 Issue clusters 4 (chapter seconds)', config as any, {id, autoplay: false, loop: false, persist: true});
  const postControls = useDialKit('Ultimate 3 · Issues postlude', {travelDuration: [settings.issues.controls.travelDuration, 0, 10, .05], timelineDuration: [settings.issues.controls.timelineDuration, 1, 60, .1]}, {id: base.issueControls, persist: true});
  const controls = useDialKit('Ultimate 3 · Signals report', {spinnerSpeed: [settings.issues.controls22?.spinnerSpeed ?? 1.9, 0, 10, .1]}, {id: controlId, persist: true});
  useTransportHandoff(timeline, chapterSchedule(settings)[3].start, settings.allocations.issues, globalTime, onTime, onPlaying, id, onSeek);
  const ready = useDialSync({[id]: issuesTimelineValues(settings), [controlId]: settings.issues.controls22 ?? {spinnerSpeed: 1.9}, [base.issueControls]: settings.issues.controls});
  const signature = timelinePreviewSignature(timeline, issuesTimelineKeys(settings));
  useEffect(() => {
    if (!ready) return;
    const flat = DialStore.getValues(id);
    const next = settingsFromIssuesTimeline(timeline, settings, flat);
    const state = micro22TimelineState(timeline, issueEntryEnd(next), 'report_', flat);
    onPreview?.({chapter: 'issues', sourceVersion: 22, issues: sampleIssues(timeline.time, next, state.progress, micro22PostludeState(timeline, issuePostludeOffset(next), flat).progress)});
    if (!same(next, settings)) onSettings(next);
  }, [signature, ready]);
  useEffect(() => {if (!ready) return; const next = normalizeSettings({...settings, issues: {...settings.issues, controls22: controls, controls: {...settings.issues.controls, ...postControls}}}); if (!same(next, settings)) onSettings(next);}, [JSON.stringify([controls, postControls]), ready]);
  return null;
}

function DetailConclusion({settings,globalTime,onTime,onPlaying,onSettings,onSeek}:BridgeProps) {
  const IDS = useContext(PanelIdsContext);
  const start=chapterSchedule(settings)[4].start; const config=useMemo(()=>conclusionTimelineConfig(settings),[settings]);
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline=useDialTimeline('Ultimate 3 — Conclusion (native seconds)',config as any,{id:IDS.conclusion,autoplay:false,loop:false,persist:true});
  useTransportHandoff(timeline,start,settings.allocations.conclusion,globalTime,onTime,onPlaying,IDS.conclusion,onSeek);
  const ready=useDialSync({[IDS.conclusion]:conclusionTimelineValues(settings)});
  const signature=timelinePreviewSignature(timeline,CONCLUSION_TIMELINE_KEYS);
  useEffect(()=>{if(!ready)return;const next=settingsFromConclusionTimeline(timeline,settings);if(Math.abs(timeline.logo.at-next.conclusion.logo.at)>.0001)DialStore.updateValues(IDS.conclusion,{'logo.at':next.conclusion.logo.at});if(!same(next,settings))onSettings(next);},[signature,ready]);
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
function ArabesqueUltimate3Audio({settings, globalTime, playing, inspecting}: Ultimate3AudioProps) {
  const soundMix=flattenUltimate3SoundMix(useDialKit('Ultimate 3 · Sound',ULTIMATE_3_SOUND_CONFIG,{id:SOUND_MIX_ID,persist:true}));
  useArabesqueAudio(globalTime, playing, inspecting, settings, soundMix);
  return <a href="?experiment=micro-18&cut=voiceover">Voiceover cut</a>;
}
const ORIGINAL_EDITION: Ultimate3Edition = {experimentId:'micro-18', settingsStorageId:SETTINGS_STORAGE_ID, panelIds:ULTIMATE3_PANEL_IDS, readSettings:()=>{installMicro20AuthoringCompatibility(DialStore, undefined, true);migrateFlowRatchetDefault();migrateUltimate3SoundStorage();return readSettings();}, Audio:ArabesqueUltimate3Audio};
export const Micro18App=({edition=ORIGINAL_EDITION}: {edition?: Ultimate3Edition})=>{
  const AudioComponent=edition.Audio;
  const editor=useRef<HTMLElement>(null); const stageHost=useRef<HTMLDivElement>(null); const stage=useRef<HTMLDivElement>(null); const [settings,setSettingsState]=useState(()=>edition.readSettings()); const query=new URLSearchParams(location.search); const requested=Number(query.get('time')); const inspecting=query.has('time')&&Number.isFinite(requested)&&requested>=0; const [globalTime,setGlobalTime]=useState(inspecting?requested:0); const [view,setView]=useState<'main'|ChapterId>('main'); const [json,setJson]=useState(''); const [live,setLive]=useState<any>(null); const [playing,setPlaying]=useState(false); const [seekGeneration,setSeekGeneration]=useState(0);
  const onSeek=(time:number)=>{setGlobalTime(time);setSeekGeneration(value=>value+1);};
  const issueValidation = useMemo(() => issueHandoffValidation(settings), [settings]);
  const setSettings=(next:Ultimate3Settings)=>{
    const save=(value:Ultimate3Settings)=>{try{localStorage.setItem(edition.settingsStorageId,JSON.stringify(value));}catch{}return value;};
    if(edition.mergeSettings)setSettingsState(current=>save(edition.mergeSettings!(current,settings,next)));
    else {setSettingsState(next);save(next);}
  };
  useEffect(()=>{let dock:Element|null=null;const update=()=>{const rect=dock?.getBoundingClientRect();editor.current?.style.setProperty('--micro18-timeline-height',`${rect&&rect.height>0?innerHeight-rect.top+6:0}px`)};const resize=new ResizeObserver(update);const attach=()=>{const next=document.querySelector('.dialkit-timeline');if(next===dock)return;resize.disconnect();dock=next;if(dock)resize.observe(dock);update()};const mount=new MutationObserver(attach);mount.observe(document.body,{childList:true,subtree:true,attributes:true});attach();addEventListener('resize',update);return()=>{mount.disconnect();resize.disconnect();removeEventListener('resize',update)}},[]);
  useEffect(()=>{const host=stageHost.current!;const update=()=>{const size=authoredStageSize(host.clientWidth,host.clientHeight);const node=stage.current!;node.style.width=`${size.width}px`;node.style.height=`${size.height}px`;node.style.setProperty('--micro18-scale',String(size.scale));};const observer=new ResizeObserver(update);observer.observe(host);update();return()=>observer.disconnect()},[]);
  let sample=sampleUltimate3(inspecting?requested:globalTime,settings);if(!inspecting&&view==='main'&&live?.chapter==='ultimate2CloudEnter'&&sample.ultimate2)sample={...sample,ultimate2:{...sample.ultimate2,progress:{...sample.ultimate2.progress,cloudEnter:live.progress}}};if(!inspecting&&view==='ultimate2'&&live?.chapter==='ultimate2'&&sample.chapter==='ultimate2')sample={...sample,ultimate2:live.playback};if(!inspecting&&view==='flow'&&live?.chapter==='flow'&&sample.chapter==='flow'&&Boolean(live.flow.playback21)===(settings.flow.sourceVersion===21))sample={...sample,flow:{...sample.flow,...live.flow}};if(!inspecting&&view==='issues'&&live?.chapter==='issues'&&live.sourceVersion===settings.issues.sourceVersion&&sample.chapter==='issues')sample={...sample,issues:live.issues};const Bridge=view==='main'?MainTimeline:view==='issues'&&settings.issues.sourceVersion===22?DetailIssues22:Details[view];
  return <PanelIdsContext.Provider value={edition.panelIds}><main data-edition={edition.experimentId} ref={editor} className="micro18-app" data-time={sample.time} data-inspecting={inspecting}><div ref={stageHost} className="micro18-stage-host"><div ref={stage} className="micro18-stage"><div className="micro18-authored"><Ultimate3Scene sample={sample} settings={settings}/></div></div></div><div className="micro18-toolbar"><nav className="micro18-nav" aria-label="Ultimate 3 timeline view"><button data-active={view==='main'} onClick={()=>setView('main')}>Main</button>{chapterSchedule(settings).map(s=><button key={s.id} data-active={view===s.id} onClick={()=>setView(s.id)} title="Switch timeline without changing the current global frame">{s.label}</button>)}</nav>{issueValidation && <output role="status" aria-label="Issues handoff validation">Issues handoff blocked: {issueValidation}</output>}<details className="micro18-settings"><summary>Settings JSON</summary><textarea aria-label="Ultimate 3 settings JSON" value={json} onChange={e=>setJson(e.currentTarget.value)}/><button onClick={()=>setJson(JSON.stringify(settings,null,2))}>Export</button><button onClick={()=>{try{setSettings((edition.normalizeSettings ?? normalizeSettings)(JSON.parse(json)))}catch{}}}>Apply</button></details>{edition.editableVoiceover && <details className="micro18-voiceover-legend"><summary>Narration · {VOICEOVER_PHRASES.length} editable clips (at / end trim)</summary><p>Bars share this playhead. Duration trims speech; it never changes its speed. Overlaps sum. Clips are capped at the frame-rounded export end. Source fades are fixed; transition/from/to controls are ignored and reset.</p><ol>{VOICEOVER_PHRASES.map(p => <li key={p.id}>{p.id}: {p.text}</li>)}</ol></details>}<AudioComponent settings={settings} globalTime={globalTime} playing={playing} inspecting={inspecting} seekGeneration={seekGeneration}/></div><ExperimentPicker current={edition.experimentId}/>{!inspecting&&<Bridge key={view === 'flow' ? `${view}-${settings.flow.sourceVersion ?? 13}` : view === 'issues' ? `${view}-${settings.issues.sourceVersion}` : view} settings={settings} globalTime={globalTime} onTime={setGlobalTime} onPlaying={setPlaying} onSettings={setSettings} onPreview={setLive} onSeek={edition.editableVoiceover ? onSeek : undefined}/>}<DialRoot/><DialTimeline visible={!inspecting}/></main></PanelIdsContext.Provider>;
};
