import {DialRoot, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {Micro08Scene} from './Scene';
import {streamPhase} from './geometry';
import {sampleMicro08} from './sample';
import {DITHER_DEFAULTS, ditherAtProgress} from './dither';
import {BLOCK_CONTENT_DEFAULTS} from './block-content';
import {readOutro} from './outro';
import {MICRO_08_TIMELINE, MICRO_08_TIMELINE_ID} from './timeline';

export const Micro08App = () => {
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Streamers → dot grid — Master (seconds)', MICRO_08_TIMELINE, {
    id: MICRO_08_TIMELINE_ID, autoplay: true, loop: false, persist: true,
  });
  const appearance = useDialKit('Paper dithering — Cloud', {
    pixelSize: [DITHER_DEFAULTS.pixelSize, 1, 8, .5],
    colorLevels: [DITHER_DEFAULTS.colorLevels, 2, 16, 1],
    contrast: [DITHER_DEFAULTS.contrast, .5, 2, .05],
    intensity: [DITHER_DEFAULTS.intensity, 0, 1, .01],
    pulse: [DITHER_DEFAULTS.pulse, 0, 1, .01],
  }, {id: 'micro-animation-08-dither-v5', persist: true});
  const blocks = useDialKit('Stream blocks', {
    showWordsAndIcons: BLOCK_CONTENT_DEFAULTS.showWordsAndIcons,
  }, {id: 'micro-animation-08-block-content-v2', persist: true});
  const query = new URLSearchParams(window.location.search);
  const requested = Number(query.get('time'));
  const state = query.has('time') && Number.isFinite(requested)
    ? sampleMicro08(requested)
    : {...streamPhase(timeline.travel.current.distance), dither: ditherAtProgress(timeline.dither.current.progress, appearance),
      outro: readOutro(key => timeline[key].current.progress)};
  return <main className="micro08-app">
    <div className="micro08-stage"><Micro08Scene {...state} showWordsAndIcons={query.has('content') ? query.get('content') === '1' : blocks.showWordsAndIcons} background={query.get('background') === 'reference' ? 'reference' : 'dither'}/></div>
    <ExperimentPicker current="micro-08"/><DialRoot/><DialTimeline/>
  </main>;
};
