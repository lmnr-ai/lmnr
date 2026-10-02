import {ISSUE_KEYS, MICRO_20_ISSUE_DEFAULTS, MICRO_20_ISSUE_TIMING} from '../micro-20/timeline';
import {useEffect, useRef, useSyncExternalStore} from 'react';
import {DialRoot, DialStore, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {ExperimentPicker} from '../ExperimentPicker';
import {MICRO_22_CONTROLS_ID, MICRO_22_TIMELINE_ID, MICRO_22_TIMING, MICRO_22_KEYS, micro22DurationFrames, micro22PreludeEnd} from './timeline';
import {installMicro22AuthoringCompatibility, micro22TimelineState, micro22PostludeState, micro22TimelineConfig, micro22PostludeOffset} from './authoring';
import {sampleMicro22} from './sample';
import {Micro22Scene} from './Scene';
import {migrateMicro22DepthStorage, migrateMicro22CaptionStorage} from './persistence';
if (typeof window !== 'undefined') {migrateMicro22DepthStorage(window.localStorage); migrateMicro22CaptionStorage(window.localStorage);}
installMicro22AuthoringCompatibility();
const subscribe = (notify: () => void) => DialStore.subscribe(MICRO_22_TIMELINE_ID, notify);
const snapshot = () => DialStore.getValues(MICRO_22_TIMELINE_ID);
const parsed = parseTimelineConfig(micro22TimelineConfig(MICRO_22_TIMING));
export function Micro22App() {
  const editor = useRef<HTMLElement>(null), host = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null);
  const query = new URLSearchParams(location.search), requested = Number(query.get('time'));
  const inspecting = query.has('time') && Number.isFinite(requested) && requested >= 0;
  const controls = useDialKit('Animation 22 · Signals', {spinnerSpeed: [1.9, 0, 10, .1]}, {id: MICRO_22_CONTROLS_ID, persist: true});
  const issueControls = useDialKit('Animation 22 · Issues postlude', {travelDuration: [MICRO_20_ISSUE_DEFAULTS.travelDuration, 0, 10, .05], timelineDuration: [7, 1, 60, .1]}, {id: `${MICRO_22_CONTROLS_ID}-postlude`, persist: true});
  const flat = useSyncExternalStore(subscribe, snapshot, snapshot);
  const resolved = Object.fromEntries(computeStaticTimeline(parsed, flat).clips.map(clip => [clip.key, computeClipState(clip, 0, 0)]));
  const authored = micro22TimelineState(resolved, 0, '', flat);
  for (const key of ISSUE_KEYS) if (flat[`postlude_${key}.at`] === undefined) {
    resolved[`postlude_${key}`] = {...resolved[`postlude_${key}`], at: micro22PreludeEnd(authored.timing) + MICRO_20_ISSUE_TIMING[key].at};
  }
  const anchor = {start: micro22PreludeEnd(authored.timing), starts: ISSUE_KEYS.map(key => Number(resolved[`postlude_${key}`].at)), presetId: DialStore.getActivePresetId(MICRO_22_TIMELINE_ID)};
  const previousAnchor = useRef(anchor);
  const postludeOffset = micro22PostludeOffset(anchor, previousAnchor.current);
  const postlude = micro22PostludeState(resolved, postludeOffset, flat);
  const postControls = {...MICRO_20_ISSUE_DEFAULTS, ...issueControls};
  const duration = micro22DurationFrames({timing: authored.timing, issueTiming: postlude.issueTiming, issueControls: postControls}) / 30;
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Animation 22 · Issue clusters 4', {duration, ...micro22TimelineConfig(authored.timing)}, {id: MICRO_22_TIMELINE_ID, autoplay: !inspecting, loop: true, persist: true});
  const state = micro22TimelineState(timeline, 0, '', flat);
  useEffect(() => {
    const corrections = Object.fromEntries([...MICRO_22_KEYS, ...ISSUE_KEYS.map(key => `postlude_${key}`)].filter(key => (timeline as any)[key].duration < .05).map(key => [`${key}.duration`, .05]));
    if (Object.keys(corrections).length) DialStore.updateValues(MICRO_22_TIMELINE_ID, corrections);
  }, [JSON.stringify([...MICRO_22_KEYS, ...ISSUE_KEYS.map(key => `postlude_${key}`)].map(key => (timeline as any)[key].duration))]);
  const post = micro22PostludeState(timeline, postludeOffset, flat);
  useEffect(() => {
    const delta = anchor.start - postludeOffset;
    previousAnchor.current = anchor;
    if (Math.abs(delta) < 1e-9) return;
    const starts = ISSUE_KEYS.map(key => anchor.start + post.issueTiming[key].at);
    previousAnchor.current = {...anchor, starts};
    DialStore.updateValues(MICRO_22_TIMELINE_ID, Object.fromEntries(ISSUE_KEYS.map((key, index) => [`postlude_${key}.at`, starts[index]])));
  }, [JSON.stringify(anchor), postludeOffset]);
  const time = inspecting ? requested : timeline.time;
  const sample = sampleMicro22(time, {timing: state.timing, controls, issueTiming: post.issueTiming, issueControls: postControls}, inspecting ? undefined : state.progress, undefined, inspecting ? undefined : post.progress);
  useEffect(() => {if (inspecting) timeline.pause();}, [inspecting, timeline.pause]);
  useEffect(() => {
    const update = () => {
      const dock = document.querySelector('.dialkit-timeline')?.getBoundingClientRect();
      editor.current?.style.setProperty('--micro20-dock', `${dock?.height ? innerHeight - dock.top + 6 : 0}px`);
      if (stage.current && host.current) stage.current.style.transform = `scale(${Math.min(host.current.clientWidth / 1280, host.current.clientHeight / 720)})`;
    };
    const observer = new ResizeObserver(update); if (host.current) observer.observe(host.current);
    const mutation = new MutationObserver(update); mutation.observe(document.body, {childList: true, subtree: true});
    addEventListener('resize', update); update();
    return () => {observer.disconnect(); mutation.disconnect(); removeEventListener('resize', update);};
  }, []);
  return <main ref={editor} className="micro20-app" data-time={time}>
    <div ref={host} className="micro20-stage-host"><div ref={stage} className="micro20-stage"><Micro22Scene sample={sample}/></div></div>
    <aside className="micro20-toolbar">Animation 22 · One trace, one expanding report · Replacement voice recording and sound alignment pending</aside>
    <ExperimentPicker current="micro-22"/><DialRoot/><DialTimeline visible={!inspecting}/>
  </main>;
}
