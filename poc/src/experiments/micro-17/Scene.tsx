import {DitherClouds} from '../micro-09/DitherClouds';
import {DEFAULTS, worldState, type Controls} from './geometry';
import type {Playback} from './sample';
import {World} from './World';
import {Subtitles} from './Subtitles';

export const Micro17Scene = ({playback, controls = DEFAULTS}: {playback: Playback; controls?: Controls}) => {
  const state = worldState(playback, controls);
  return <div className="micro17-composition" aria-label="Ultimate 2: continuous trace, upward turn, three garage doors, warning zoom and permanent cloud cover">
    <World state={state} playback={playback} controls={controls}/>
    {/* Only the original cloud renderer, permanently at its cover pose. There
        is no Signals title, sparkling grid, Animation 9 playback, or exit. */}
    {state.cloudEnter > 0 && <div className="micro17-cover">
      <DitherClouds progress={state.cloudProgress} yOffset={27} translateY={state.cloudTranslateY} translateX={state.cloudTranslateX}/>
    </div>}
    <Subtitles progress={playback.progress}/>
  </div>;
};
