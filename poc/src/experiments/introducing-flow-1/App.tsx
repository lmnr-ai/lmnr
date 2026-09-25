import {DialRoot, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {IntroducingFlow1Scene} from './Scene';
import {liveIntroducingFlow1, sampleIntroducingFlow1} from './sample';
import {INTRODUCING_FLOW_1_TIMELINE, INTRODUCING_FLOW_1_TIMELINE_ID} from './timeline';

export const IntroducingFlow1App = () => {
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Animation 13 - Introducing Flow-1 — Master (seconds)', INTRODUCING_FLOW_1_TIMELINE, {
    id: INTRODUCING_FLOW_1_TIMELINE_ID, autoplay: true, loop: true, persist: true,
  });
  const clouds = useDialKit('Cloud position', {
    yOffset: [37, -500, 500, 1],
  }, {id: 'introducing-flow-1-cloud-position-v2', persist: true});
  const dots = useDialKit('Dot appearance', {
    blueScale: [1.2, .25, 5, .05],
  }, {id: 'introducing-flow-1-dot-appearance-v2', persist: true});
  const rows = useDialKit('Benchmark rows', {
    numberRowStagger: [.05, 0, .25, .01],
  }, {id: 'introducing-flow-1-benchmark-rows-v1', persist: true});
  const cover = useDialKit('Cover motion', {
    direction: {
      type: 'select',
      options: [
        {value: 'top', label: 'From top'},
        {value: 'right', label: 'From right'},
        {value: 'split', label: 'Split doors'},
      ],
      default: 'top',
    },
  }, {id: 'introducing-flow-1-cover-motion-v2', persist: true});
  const engineColors = useDialKit('Engine colors', {
    mutedGray: {type: 'color', default: '#474747'},
  }, {id: 'introducing-flow-1-engine-colors-v2', persist: true});
  const query = new URLSearchParams(window.location.search);
  const requested = Number(query.get('time'));
  const inspecting = query.has('time') && Number.isFinite(requested);
  const playback = inspecting ? sampleIntroducingFlow1(Math.max(0, requested)) : liveIntroducingFlow1(timeline);
  return <main className="flow1-app">
    <div className="flow1-stage"><IntroducingFlow1Scene playback={playback} cloudYOffset={clouds.yOffset} blueDotScale={dots.blueScale} numberRowStagger={rows.numberRowStagger} coverMotion={cover.direction as 'top' | 'right' | 'split'} mutedGray={engineColors.mutedGray}/></div>
    <ExperimentPicker current="introducing-flow-1"/><DialRoot/><DialTimeline/>
  </main>;
};
