import {useEffect, useRef} from 'react';
import {DialRoot, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {Micro16Scene} from './Scene';
import {sampleMicro16} from './sample';
import {DEFAULTS, MICRO_16_TIMELINE, MICRO_16_TIMELINE_ID} from './timeline';
import {useRatchetClicks} from '../use-ratchet-clicks';
import {costClickTracks} from './cost-ratchet';

export const Micro16App = () => {
  const editor = useRef<HTMLElement>(null);
  useEffect(() => {
    let dock: Element | null = null;
    const update = () => {
      const rect = dock?.getBoundingClientRect();
      const reserved = rect && rect.height > 0 ? window.innerHeight - rect.top + 6 : 0;
      editor.current?.style.setProperty('--micro16-timeline-height', `${reserved}px`);
    };
    const resize = new ResizeObserver(update);
    const attach = () => {
      const next = document.querySelector('.dialkit-timeline');
      if (next === dock) return;
      resize.disconnect(); dock = next;
      if (dock) resize.observe(dock);
      update();
    };
    const mount = new MutationObserver(attach);
    mount.observe(document.body, {childList: true, subtree: true}); attach();
    window.addEventListener('resize', update);
    return () => {mount.disconnect(); resize.disconnect(); window.removeEventListener('resize', update);};
  }, []);
  const controls = useDialKit('Animation 16 — Speed and smoke', {
    travelSpeed: [DEFAULTS.travelSpeed, 0, 1800, 10],
    purpleSpinnerSpeed: [DEFAULTS.purpleSpinnerSpeed, 0, 10, .1],
    cheapSpinnerSpeed: [DEFAULTS.cheapSpinnerSpeed, 0, 20, .1],
    cheapSpinnerStrokeWidth: [DEFAULTS.cheapSpinnerStrokeWidth, 0, 12, .25],
    smokeSize: [DEFAULTS.smokeSize, 0, 2, .05],
    smokeMinimumScale: [DEFAULTS.smokeMinimumScale, 0, 1, .05],
  }, {id: 'micro-animation-16-controls-v1', persist: true});
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Animation 16 — Cost of a trace — Master (seconds)', MICRO_16_TIMELINE, {
    id: MICRO_16_TIMELINE_ID, autoplay: false, loop: true, persist: true,
  });
  const query = new URLSearchParams(window.location.search);
  const requested = Number(query.get('time'));
  const inspecting = query.has('time') && Number.isFinite(requested);
  const time = inspecting ? Math.max(0, requested) : timeline.time;
  const soundMix = useDialKit('Animation 16 — Sound', {ratchetVolume: [1, 0, 10, .01]}, {id: 'micro-animation-16-ratchet-sound-v1', persist: true});
  useRatchetClicks(time, !inspecting && timeline.playing, costClickTracks(timeline, controls), soundMix.ratchetVolume);
  // Resample the live timing AND curve at an arbitrary inspection time. The
  // identical pure seam accepts serialized timing/controls in Remotion props.
  return <main ref={editor} className="micro16-app" data-time={time}>
    <div className="micro16-stage"><Micro16Scene state={sampleMicro16(time, controls, timeline)}/></div>
    <ExperimentPicker current="micro-16"/><DialRoot/><DialTimeline/>
  </main>;
};
