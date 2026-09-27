import {useEffect, useRef, useSyncExternalStore} from 'react';
import {DialRoot, DialStore, DialTimeline, useDialKit, useDialTimeline, type DialValue} from 'dialkit';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {ExperimentPicker} from '../ExperimentPicker';
import {ISSUE_START, MICRO_20_CONTROLS_ID, MICRO_20_DEFAULTS, MICRO_20_ISSUES_CONTROLS_ID, MICRO_20_TIMELINE, MICRO_20_TIMELINE_ID, micro20DurationFrames, serializeTimeline} from './timeline';
import {sampleMicro20} from './sample';
import {Micro20Scene} from './Scene';
import {CHAPTER_CONTROLS_ID, migrateMicro20Storage, migrateMicro20OddGridRadius, migrateMicro20SpinnerSpeeds, readMicro20Values} from './persistence';
import {installMicro20AuthoringCompatibility} from './authoring';

// Before DialKit registration: preserve timeline imports and migrate only the
// obsolete owned radius default once, with an independent original backup.
let loadedValues: Record<string, DialValue> = {};
let authoringError: string | null = null;
try {installMicro20AuthoringCompatibility();} catch (error) {authoringError = String(error);}
if (!authoringError && typeof window !== 'undefined') {
  try {
    migrateMicro20Storage(window.localStorage);
    migrateMicro20OddGridRadius(window.localStorage);
    migrateMicro20SpinnerSpeeds(window.localStorage);
    loadedValues = readMicro20Values(window.localStorage) as Record<string, DialValue>;
  } catch { /* Storage may be disabled. */ }
}
const subscribe = (notify: () => void) => DialStore.subscribe(MICRO_20_TIMELINE_ID, notify);
const snapshot = () => {
  const values = DialStore.getValues(MICRO_20_TIMELINE_ID);
  return Object.keys(values).length ? values : loadedValues;
};
const parsed = parseTimelineConfig(MICRO_20_TIMELINE);

export const Micro20App = () => authoringError
  ? <main role="alert">{authoringError}<ExperimentPicker current="micro-20"/></main>
  : <Micro20Editor/>;

const Micro20Editor = () => {
  const editor = useRef<HTMLElement>(null), host = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null);
  const query = new URLSearchParams(location.search), requested = Number(query.get('time'));
  const inspecting = query.has('time') && Number.isFinite(requested) && requested >= 0;
  const controls = useDialKit('Animation 20 · Analysis', {
    spinnerEntrySpeed: [MICRO_20_DEFAULTS.spinnerEntrySpeed, 0, 10, .1],
    spinnerStopSpeed: [MICRO_20_DEFAULTS.spinnerStopSpeed, 0, 10, .1],
    spinnerDescentSpeed: [MICRO_20_DEFAULTS.spinnerDescentSpeed, 0, 10, .1],
    spinnerZoomSpeed: [MICRO_20_DEFAULTS.spinnerZoomSpeed, 0, 10, .1],
    spinnerAnalysisSpeed: [MICRO_20_DEFAULTS.spinnerAnalysisSpeed, 0, 10, .1],
    radialCircleRadius: [MICRO_20_DEFAULTS.radialCircleRadius, 0, 1400, 1],
    radialSoftness: [MICRO_20_DEFAULTS.radialSoftness, 0, 1, .05],
    timelineDuration: [MICRO_20_DEFAULTS.timelineDuration, 1, 120, .1],
  }, {id: MICRO_20_CONTROLS_ID, persist: true});
  const issueDials = useDialKit('Animation 20 · Issues (travel and minimum hold)', {
    travelDuration: [2.3, 0, 10, .05], timelineDuration: [7, 1, 60, .1],
  }, {id: MICRO_20_ISSUES_CONTROLS_ID, persist: true});
  const chapter = useDialKit('Animation 20 · Earliest handoff', {earliestHandoff: [ISSUE_START, 0, 60, .05]}, {id: CHAPTER_CONTROLS_ID, persist: true});
  const issueControls = {warningAppearanceDuration: 0, ...issueDials};
  // Derive duration from this render's authored store, not a seek effect or
  // previous transport sample. The hook below remains the sole clock owner.
  const flat = useSyncExternalStore(subscribe, snapshot, snapshot);
  const raw: Record<string, unknown> = {issues: {}};
  for (const clip of computeStaticTimeline(parsed, flat).clips) {
    const state = computeClipState(clip, 0, 0);
    if (clip.group) (raw[clip.group] as Record<string, unknown>)[clip.childKey!] = state;
    else raw[clip.key] = state;
  }
  const authored = serializeTimeline(raw, flat);
  const duration = micro20DurationFrames({...controls, ...authored, issueControls, issueStart: chapter.earliestHandoff}) / 30;
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Animation 20 · Earliest starts (global seconds)', {...MICRO_20_TIMELINE, duration}, {
    id: MICRO_20_TIMELINE_ID, autoplay: !inspecting, loop: true, persist: true,
  });
  const time = inspecting ? requested : timeline.time;
  const state = serializeTimeline(timeline, flat);
  const sample = sampleMicro20(time, controls, state.preludeTiming, issueControls, state.issueTiming, chapter.earliestHandoff);
  useEffect(() => {if (inspecting) timeline.pause();}, [inspecting, timeline.pause]);
  useEffect(() => {
    let dock: Element | null = null;
    const update = () => {
      const rect = dock?.getBoundingClientRect();
      editor.current?.style.setProperty('--micro20-dock', `${rect && rect.height ? innerHeight - rect.top + 6 : 0}px`);
    };
    const observer = new ResizeObserver(update);
    const mutation = new MutationObserver(() => {
      const next = document.querySelector('.dialkit-timeline');
      if (next !== dock) {observer.disconnect(); dock = next; if (dock) observer.observe(dock);}
      update();
    });
    mutation.observe(document.body, {childList: true, subtree: true}); update(); addEventListener('resize', update);
    return () => {observer.disconnect(); mutation.disconnect(); removeEventListener('resize', update);};
  }, []);
  useEffect(() => {
    const resize = () => {
      if (!host.current || !stage.current) return;
      stage.current.style.transform = `scale(${Math.min(host.current.clientWidth / 1280, host.current.clientHeight / 720)})`;
    };
    const observer = new ResizeObserver(resize); if (host.current) observer.observe(host.current); resize();
    return () => observer.disconnect();
  }, []);
  return <main ref={editor} className="micro20-app" data-time={time} data-inspecting={inspecting} data-issue-start={sample.issueStart} data-duration={duration}>
    <div ref={host} className="micro20-stage-host"><div ref={stage} className="micro20-stage"><Micro20Scene sample={sample}/></div></div>
    <aside className="micro20-toolbar">
      <span>One clock · bars = earliest starts · issue chapter ripple: {(sample.issueStart - ISSUE_START).toFixed(2)}s · handoff {sample.issueStart.toFixed(2)}s</span>
      {time >= sample.issueStart && sample.phase !== 'issues' && <strong>{sample.validation ?? 'Prelude endpoints must finish at 1 before handoff.'}</strong>}
    </aside>
    <ExperimentPicker current="micro-20"/><DialRoot/><DialTimeline visible={!inspecting}/>
  </main>;
};
