import {DialRoot, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {MAX_DISPERSION_FRAMES} from './dispersion';
import {sampleMicro14} from './sample';
import {Micro14Scene} from './Scene';
import {MICRO_14_DEFAULTS, MICRO_14_TIMELINE, MICRO_14_TIMELINE_ID} from './timeline';

export const Micro14App = () => {
  const controls = useDialKit('Issue cluster dispersion', {
    seed: [MICRO_14_DEFAULTS.seed, 0, 999999, 1],
    dispersionFrames: [MICRO_14_DEFAULTS.dispersionFrames, 0, MAX_DISPERSION_FRAMES, 1],
    swapProbability: [MICRO_14_DEFAULTS.swapProbability, 0, 1, .01],
    swapGap: [MICRO_14_DEFAULTS.swapGap, 0, .95, .01],
    smallClusterDelay: [MICRO_14_DEFAULTS.smallClusterDelay, 0, .95, .01],
    warningAppearanceDuration: [MICRO_14_DEFAULTS.warningAppearanceDuration, 0, 2, .05],
    warningCoverDuration: [MICRO_14_DEFAULTS.warningCoverDuration, 0, 5, .05],
    timelineDuration: [MICRO_14_DEFAULTS.timelineDuration, 1, 60, .1],
  }, {id: 'micro-animation-14-dispersion-v1', persist: true});
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Issue clusters — Master (seconds)', {...MICRO_14_TIMELINE, duration: controls.timelineDuration}, {
    id: MICRO_14_TIMELINE_ID, autoplay: true, loop: true, persist: true,
  });
  const query = new URLSearchParams(window.location.search);
  const requested = Number(query.get('time'));
  const inspecting = query.has('time') && Number.isFinite(requested);
  const time = inspecting ? Math.max(0, requested) : timeline.time;
  return <main className="micro14-app">
    <div className="micro14-stage"><Micro14Scene {...sampleMicro14(time, controls, timeline)}/></div>
    <aside className="micro14-note">Appearance: seeded dot-to-warning transitions · Covers start as soon as each square forms</aside>
    <ExperimentPicker current="micro-14"/><DialRoot/><DialTimeline/>
  </main>;
};
