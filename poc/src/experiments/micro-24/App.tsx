import {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {DialRoot, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {FLOW_3_APPEARANCE, IntroducingFlow3Scene} from './Scene';
import {createFlow3Sampler, flow3TimelineConfig, liveFlow3} from './sample';
import {FLOW_3_TIMELINE, FLOW_3_TIMELINE_ID} from './timeline';
import type {CoverMotion} from '../introducing-flow-1/geometry';
import {migrateFlow3Timeline} from './persistence';

if (typeof window !== 'undefined') {
  try {migrateFlow3Timeline(window.localStorage);} catch { /* Storage can be disabled. */ }
}

export const IntroducingFlow3App = () => {
  const query = new URLSearchParams(window.location.search);
  const requested = Number(query.get('time'));
  const inspecting = query.has('time') && Number.isFinite(requested) && requested >= 0;
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Animation 24 — Introducing Flow-1 3 (seconds)', FLOW_3_TIMELINE, {
    id: FLOW_3_TIMELINE_ID, autoplay: !inspecting, loop: true, persist: true,
  });
  const controls = useDialKit('Flow-1 3 · appearance', {
    cloudYOffset: [37, -500, 500, 1], blueDotScale: [1.2, .25, 5, .05],
    beadStaggerSeconds: [FLOW_3_APPEARANCE.beadStaggerSeconds, 0, .5, .01],
    coverMotion: {type: 'select', options: [{value: 'top', label: 'From top'}, {value: 'right', label: 'From right'}, {value: 'split', label: 'Split doors'}], default: FLOW_3_APPEARANCE.coverMotion},
    mutedGray: {type: 'color', default: '#474747'},
  }, {id: 'micro-animation-24-appearance-v1', persist: true});
  const configJSON = JSON.stringify(flow3TimelineConfig(timeline));
  const sampler = useMemo(() => createFlow3Sampler(JSON.parse(configJSON)), [configJSON]);
  const playback = inspecting ? sampler.sample(requested) : liveFlow3(timeline);
  const editor = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [copyStatus, setCopyStatus] = useState('Copy export props');
  useLayoutEffect(() => {
    const element = host.current!;
    let observedDock: Element | null = null;
    const update = () => {
      const dock = document.querySelector('.dialkit-timeline');
      if (dock !== observedDock) {
        if (observedDock) observer.unobserve(observedDock);
        if (dock) observer.observe(dock);
        observedDock = dock;
      }
      const rect = dock?.getBoundingClientRect();
      editor.current?.style.setProperty('--flow3-dock', `${rect?.height ? innerHeight - rect.top + 6 : 0}px`);
      setScale(Math.max(0, Math.min(element.clientWidth / 1280, element.clientHeight / 720)));
    };
    const observer = new ResizeObserver(update);
    const mutation = new MutationObserver(update);
    observer.observe(element);
    mutation.observe(document.body, {childList: true, subtree: true});
    window.addEventListener('resize', update);
    update();
    return () => {observer.disconnect(); mutation.disconnect(); window.removeEventListener('resize', update);};
  }, []);
  return <main ref={editor} className="flow3-app">
    <header className="flow3-toolbar">
      <ExperimentPicker current="micro-24"/>
      <button onClick={() => navigator.clipboard.writeText(JSON.stringify({timeline: JSON.parse(configJSON), ...controls}, null, 2))
        .then(() => setCopyStatus('Copied')).catch(() => setCopyStatus('Copy failed'))}>{copyStatus}</button>
    </header>
    <div ref={host} className="flow3-stage-host">
      <div className="flow3-stage" style={{width: 1280 * scale, height: 720 * scale, '--flow3-scale': scale} as React.CSSProperties}>
        <IntroducingFlow3Scene playback={playback} {...controls} coverMotion={controls.coverMotion as CoverMotion}/>
      </div>
    </div>
    {!inspecting && <DialRoot/>}<DialTimeline visible={!inspecting}/>
  </main>;
};
