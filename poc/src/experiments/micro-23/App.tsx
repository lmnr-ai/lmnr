import {useEffect, useMemo, useRef, useSyncExternalStore} from 'react';
import {DialRoot, DialStore, DialTimeline, TimelineStore, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {installMicro20AuthoringCompatibility} from '../micro-20/authoring';
import {Micro23Scene} from './Scene';
import {migrateGridColor} from './grid-color-migration';
import {createMicro23Sampler, inspectionTime} from './sample';
import {MICRO_23_CONTROLS_ID, MICRO_23_DEFAULTS, MICRO_23_KEYS, MICRO_23_TIMELINE, MICRO_23_TIMELINE_ID} from './timeline';

// Reuse the existing version-pinned seam, owned ONLY by this panel's transitions.
installMicro20AuthoringCompatibility(DialStore, undefined, true, MICRO_23_TIMELINE_ID, MICRO_23_KEYS.map(key => `${key}.transition`));
const subscribe = (notify: () => void) => DialStore.subscribe(MICRO_23_TIMELINE_ID, notify);
const snapshot = () => DialStore.getValues(MICRO_23_TIMELINE_ID);

export function Micro23App() {
  const editor = useRef<HTMLElement>(null), host = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null);
  const requested = inspectionTime(location.search), inspecting = requested !== null;
  const controls = useDialKit('Animation 23 · Appearance', {
    startCellSize: [MICRO_23_DEFAULTS.startCellSize, 20, 120, 1],
    endCellSize: [MICRO_23_DEFAULTS.endCellSize, 10, 60, 1],
    dotDiameter: [MICRO_23_DEFAULTS.dotDiameter, 1, 16, .25],
    dotDuration: [MICRO_23_DEFAULTS.dotDuration, .01, 2, .01],
    hold: [MICRO_23_DEFAULTS.hold, 0, 10, .1],
    gridColor: {type: 'color', default: MICRO_23_DEFAULTS.gridColor},
    orangeColor: {type: 'color', default: MICRO_23_DEFAULTS.orangeColor},
    blueColor: {type: 'color', default: MICRO_23_DEFAULTS.blueColor},
  }, {id: MICRO_23_CONTROLS_ID, persist: true});
  useEffect(() => {
    try {migrateGridColor(DialStore, window.localStorage);} catch { /* Storage may be disabled. */ }
  }, []);
  const values = useSyncExternalStore(subscribe, snapshot, snapshot);
  const sampler = useMemo(() => createMicro23Sampler({values, controls}), [values, controls]);
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Animation 23 - Traces per dollar', {duration: sampler.duration, ...MICRO_23_TIMELINE}, {
    id: MICRO_23_TIMELINE_ID, autoplay: !inspecting, loop: true, persist: true,
  });
  // Keep the persisted exit key so existing timing/curve edits and presets survive.
  // Only its user-facing timeline label changes from fade-out to slide-out.
  useEffect(() => {
    const labelExit = () => {
      const meta = TimelineStore.getTimeline(MICRO_23_TIMELINE_ID);
      if (!meta?.clips.some(clip => clip.key === 'headlineFadeOut' && clip.label !== 'Headline Slide Out')) return;
      TimelineStore.update({...meta, clips: meta.clips.map(clip => clip.key === 'headlineFadeOut' ? {...clip, label: 'Headline Slide Out'} : clip)});
    };
    labelExit();
    return TimelineStore.subscribe(MICRO_23_TIMELINE_ID, labelExit);
  }, []);
  const time = requested ?? timeline.time;
  useEffect(() => {if (inspecting) timeline.pause();}, [inspecting, timeline.pause]);
  useEffect(() => {
    let observedDock: Element | null = null;
    const update = () => {
      const dock = document.querySelector('.dialkit-timeline');
      if (dock !== observedDock) {
        if (observedDock) observer.unobserve(observedDock);
        if (dock) observer.observe(dock);
        observedDock = dock;
      }
      const rect = dock?.getBoundingClientRect();
      editor.current?.style.setProperty('--micro23-dock', `${rect?.height ? innerHeight - rect.top + 6 : 0}px`);
      if (stage.current && host.current) stage.current.style.transform = `scale(${Math.min(host.current.clientWidth / 1280, host.current.clientHeight / 720)})`;
    };
    const observer = new ResizeObserver(update);
    if (host.current) observer.observe(host.current);
    const mutation = new MutationObserver(update);
    mutation.observe(document.body, {childList: true, subtree: true});
    addEventListener('resize', update); update();
    return () => {observer.disconnect(); mutation.disconnect(); removeEventListener('resize', update);};
  }, []);
  const exportSettings = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({values, controls: sampler.controls}, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'animation-23-props.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <main ref={editor} className="micro23-app" data-time={time} data-inspecting={inspecting}>
    <div ref={host} className="micro23-stage-host"><div ref={stage} className="micro23-stage"><Micro23Scene sample={sampler.sample(time)} controls={sampler.controls}/></div></div>
    <aside className="micro23-toolbar"><span>Animation 23 · Traces per dollar · Dot Duration is seconds per dot (clamped to its group bar)</span><button onClick={exportSettings}>Export render settings</button></aside>
    <ExperimentPicker current="micro-23"/>{!inspecting && <DialRoot/>}<DialTimeline visible={!inspecting}/>
  </main>;
}
