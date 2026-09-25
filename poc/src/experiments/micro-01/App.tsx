import {DialRoot, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {MicroScene} from './Scene';
import {PANEL_ID, TIMELINE, type MicroSample} from './timeline';

export const MicroAnimationApp = () => {
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Micro animation 01', TIMELINE, {
    id: PANEL_ID,
    autoplay: false,
    loop: true,
    persist: true,
  });

  const appearance = useDialKit('Path appearance', {
    whiteTrailOpacity: [0.07, 0, 0.5, 0.01],
    dashGap: [0, 0, 4, 0.05],
    strokeWidth: [20, 4, 120, 1],
    maskWidth: [108, 0, 360, 4],
    maskOpacity: [0.5, 0, 1, 0.01],
    perspective: [1200, 300, 3000, 10],
    rotateX: [0, -70, 70, 1],
    rotateY: [0, -70, 70, 1],
    rotateZ: [-7, -90, 90, 1],
    shearX: [9, -45, 45, 1],
    shearY: [0, -45, 45, 1],
    scale: [1, 0.5, 1.5, 0.01],
  }, {id: 'micro-animation-01-appearance-v3', persist: true});
  // DialKit's documented React integration: bind the preview directly to each
  // clip's live `current` value so moving/resizing timeline bars updates it.
  const comets: MicroSample = {
    orangeComet: timeline.orangeComet.current,
    leftWhiteComet: timeline.leftWhiteComet.current,
    lowerWhiteComet: timeline.lowerWhiteComet.current,
    upperWhiteComet: timeline.upperWhiteComet.current,
  };

  return (
    <>
      <MicroScene time={timeline.time} comets={comets} {...appearance} />
      <ExperimentPicker current="micro-01" />
      <DialRoot />
      <DialTimeline />
    </>
  );
};
