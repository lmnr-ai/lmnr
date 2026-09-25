import {useEffect, useRef} from 'react';
import {DialRoot, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {Micro15Scene} from './Scene';
import {MICRO_15_CONTROLS_ID, migrateAgentControls} from './persistence';
import {sampleMicro15, sampleMicro15Live} from './sample';
import {MICRO_15_DEFAULTS, MICRO_15_TIMELINE, MICRO_15_TIMELINE_ID} from './timeline';

if (typeof window !== 'undefined') {
  try {migrateAgentControls(window.localStorage);} catch { /* Storage may be disabled, as supported by DialKit. */ }
}

export const Micro15App = () => {
  const editor = useRef<HTMLElement>(null);
  useEffect(() => {
    let dock: Element | null = null;
    const update = () => {
      const rect = dock?.getBoundingClientRect();
      const reserved = rect && rect.height > 0 ? window.innerHeight - rect.top + 6 : 0;
      editor.current?.style.setProperty('--micro15-timeline-height', `${reserved}px`);
    };
    const resize = new ResizeObserver(update);
    const attach = () => {
      const next = document.querySelector('.dialkit-timeline');
      if (next === dock) return;
      resize.disconnect();
      dock = next;
      if (dock) resize.observe(dock);
      update();
    };
    // DialKit mounts its portal after our effect; also handle hide/reopen.
    const mount = new MutationObserver(attach);
    mount.observe(document.body, {childList: true, subtree: true});
    attach();
    window.addEventListener('resize', update);
    return () => {mount.disconnect(); resize.disconnect(); window.removeEventListener('resize', update);};
  }, []);
  const controls = useDialKit('Issue clusters 2 — Direct travel', {
    warningAppearanceDuration: [MICRO_15_DEFAULTS.warningAppearanceDuration, 0, 2, .05],
    travelDuration: [MICRO_15_DEFAULTS.travelDuration, 0, 10, .05],
    timelineDuration: [MICRO_15_DEFAULTS.timelineDuration, 1, 60, .1],
  }, {id: MICRO_15_CONTROLS_ID, persist: true});
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Issue clusters 2 — Master (seconds)', {...MICRO_15_TIMELINE, duration: controls.timelineDuration}, {
    id: MICRO_15_TIMELINE_ID, autoplay: true, loop: true, persist: true,
  });
  const query = new URLSearchParams(window.location.search);
  const requested = Number(query.get('time'));
  const inspecting = query.has('time') && Number.isFinite(requested);
  const time = inspecting ? Math.max(0, requested) : timeline.time;
  const sample = inspecting
    ? sampleMicro15(time, controls, timeline)
    : sampleMicro15Live(time, controls, timeline, timeline);
  return <main ref={editor} className="micro14-app micro15-app">
    <div className="micro14-stage"><Micro15Scene {...sample}/></div>
    <aside className="micro14-note">Issue clusters → coding agent · Scroll the timeline for prompt, issue badge, send, SQL typing, and window exit</aside>
    <ExperimentPicker current="micro-15"/><DialRoot/><DialTimeline/>
  </main>;
};
