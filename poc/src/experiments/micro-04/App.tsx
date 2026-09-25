import {DialRoot, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {Micro04Scene} from './Scene';
import {MICRO_04_TIMELINE, MICRO_04_TIMELINE_ID} from './timeline';

export const Micro04App = () => {
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Micro animation 04 — Master (seconds)', MICRO_04_TIMELINE, {
    id: MICRO_04_TIMELINE_ID,
    autoplay: false,
    loop: true,
    persist: true,
  });
  const thinking = useDialKit('Thinking ellipsis', {
    interval: [0.15, 0.05, 2, 0.05],
  }, {id: 'micro-animation-04-thinking-v2', persist: true});
  const colors = useDialKit('Container colors', {
    lightnessOffset: [-5, -40, 40, 0.5],
  }, {id: 'micro-animation-04-colors-v2', persist: true});
  const outro = useDialKit('Outro frame and logo', {
    finalFrameSize: [148, 120, 400, 1],
    logoScaleDestination: [48, 10, 200, 1],
    logoBlurPeak: [28, 0, 40, 0.5],
  }, {id: 'micro-animation-04-outro-v3', persist: true});
  const noise = useDialKit('Container noise', {
    opacity: [0.12, 0, 0.5, 0.01],
    frequency: [0.8, 0.05, 2, 0.01],
  }, {id: 'micro-animation-04-noise-v1', persist: true});

  return (
    <main className="micro04-app">
      <div className="micro04-stage">
        <Micro04Scene
          time={timeline.time}
          values={{
            crosses: timeline.crosses.current.progress,
            lines: timeline.lines.current.progress,
            loaderReveal: timeline.loaderReveal.current.progress,
            loaderSpin: timeline.loaderSpin.current.progress,
            thinkingWidth: timeline.thinkingWidth.current.progress,
            rowTwo: timeline.rowTwo.current.progress,
            rowTwoSlide: timeline.rowTwoSlide.current.progress,
            rowThree: timeline.rowThree.current.progress,
            endCircleScale: timeline.endCircleScale.current.progress,
            timer: timeline.timer.current.progress,
            blocksOutro: timeline.blocksOutro.current.progress,
            gridDissolve: timeline.gridDissolve.current.progress,
            shapeMorph: timeline.shapeMorph.current.progress,
            logoBlurEnter: timeline.logoBlurEnter.current.progress,
            logoBlurExit: timeline.logoBlurExit.current.progress,
            frameConverge: timeline.frameConverge.current.progress,
          }}
          finalFrameSize={outro.finalFrameSize}
          logoScaleDestination={outro.logoScaleDestination}
          logoBlurPeak={outro.logoBlurPeak}
          ellipsisInterval={thinking.interval}
          lightnessOffset={colors.lightnessOffset}
          noiseOpacity={noise.opacity}
          noiseFrequency={noise.frequency}
        />
      </div>
      <ExperimentPicker current="micro-04" />
      <DialRoot />
      <DialTimeline />
    </main>
  );
};
