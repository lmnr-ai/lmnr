import {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {DialRoot, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {FLOW_2_APPEARANCE, IntroducingFlow2Scene} from './Scene';
import {createFlow2Sampler, flow2TimelineConfig, liveFlow2} from './sample';
import {FLOW_2_TIMELINE, FLOW_2_TIMELINE_ID} from './timeline';
import type {CoverMotion} from '../introducing-flow-1/geometry';

export const IntroducingFlow2App = () => {
  const query = new URLSearchParams(window.location.search);
  const requested = Number(query.get('time'));
  const inspecting = query.has('time') && Number.isFinite(requested) && requested >= 0;
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Animation 21 — Introducing Flow-1 2 (seconds)', FLOW_2_TIMELINE, {
    id: FLOW_2_TIMELINE_ID, autoplay: !inspecting, loop: true, persist: true,
  });
  const controls = useDialKit('Flow-1 2 · appearance', {
    cloudYOffset: [37, -500, 500, 1], blueDotScale: [1.2, .25, 5, .05],
    beadStaggerSeconds: [FLOW_2_APPEARANCE.beadStaggerSeconds, 0, .5, .01],
    coverMotion: {type: 'select', options: [{value: 'top', label: 'From top'}, {value: 'right', label: 'From right'}, {value: 'split', label: 'Split doors'}], default: FLOW_2_APPEARANCE.coverMotion},
    mutedGray: {type: 'color', default: '#474747'},
  }, {id: 'introducing-flow-1-2-appearance-v1', persist: true});
  const configJSON = JSON.stringify(flow2TimelineConfig(timeline));
  const sampler = useMemo(() => createFlow2Sampler(JSON.parse(configJSON)), [configJSON]);
  const playback = inspecting ? sampler.sample(requested) : liveFlow2(timeline);
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [copyStatus, setCopyStatus] = useState('Copy export props');
  useLayoutEffect(() => {
    const element = host.current!;
    const update = () => setScale(Math.max(0, Math.min(element.clientWidth / 1280, element.clientHeight / 720)));
    const observer = new ResizeObserver(update);
    observer.observe(element); update();
    return () => observer.disconnect();
  }, []);
  return <main className="flow2-app">
    <header className="flow2-toolbar">
      <ExperimentPicker current="introducing-flow-1-2"/>
      <button onClick={() => navigator.clipboard.writeText(JSON.stringify({timeline: JSON.parse(configJSON), ...controls}, null, 2))
        .then(() => setCopyStatus('Copied')).catch(() => setCopyStatus('Copy failed'))}>{copyStatus}</button>
    </header>
    <div ref={host} className="flow2-stage-host">
      <div className="flow2-stage" style={{width: 1280 * scale, height: 720 * scale, '--flow2-scale': scale} as React.CSSProperties}>
        <IntroducingFlow2Scene playback={playback} {...controls} coverMotion={controls.coverMotion as CoverMotion}/>
      </div>
    </div>
    <DialRoot/><DialTimeline/>
  </main>;
};
