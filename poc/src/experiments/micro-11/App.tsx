import {DialRoot, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {MICRO_11_DEFAULTS, sampleMicro11} from './geometry';
import {Micro11Scene} from './Scene';
import {sampleMicro11Transition} from './sample';
import {MICRO_11_TIMELINE, MICRO_11_TIMELINE_ID} from './timeline';

export const Micro11App = () => {
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Streamer — Master (seconds)', MICRO_11_TIMELINE, {
    id: MICRO_11_TIMELINE_ID, autoplay: true, loop: true, persist: true,
  });
  const motion = useDialKit('Motion', {
    streamerSpeed: [MICRO_11_DEFAULTS.streamerSpeed, 0, 1200, 10],
    loaderSpeed: [MICRO_11_DEFAULTS.loaderSpeed, 0, 6, .05],
    streamSeed: [MICRO_11_DEFAULTS.streamSeed, 0, 9999, 1],
  }, {id: 'micro-animation-11-motion-v2', persist: true});
  const query = new URLSearchParams(window.location.search);
  const requested = Number(query.get('time'));
  const inspecting = query.has('time') && Number.isFinite(requested);
  const time = inspecting ? Math.max(0, requested) : timeline.time;
  const transition = inspecting ? sampleMicro11Transition(time) : {
    smallGridFade: timeline.smallGridFade.current.progress,
    zoomOut: timeline.zoomOut.current.progress,
    streamCollapse: timeline.streamCollapse.current.progress,
    loaderFade: timeline.loaderFade.current.progress,
    dotDim: timeline.dotDim.current.progress,
  };
  return <main className="micro11-app">
    <div className="micro11-stage"><Micro11Scene {...sampleMicro11(time, motion, transition)}/></div>
    <ExperimentPicker current="micro-11"/><DialRoot/><DialTimeline/>
  </main>;
};
