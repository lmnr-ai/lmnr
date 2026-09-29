import {DitherClouds} from '../micro-09/DitherClouds';
import {DEFAULTS, worldState, type Controls} from './geometry';
import type {Playback} from './sample';
import {World} from './World';
import {Subtitles} from './Subtitles';

export const Micro17Scene = ({playback, controls = DEFAULTS, showClouds = true, blocksRemoved = 14, showSubtitles = true}: {playback: Playback; controls?: Controls; showClouds?: boolean; blocksRemoved?: number; showSubtitles?: boolean}) => {
  const state = worldState(playback, controls, blocksRemoved);
  return <div className="micro17-composition" aria-label="Ultimate 2: continuous trace, upward turn, three garage doors, warning zoom and permanent cloud cover">
    <World state={state} playback={playback} controls={controls}/>
    {/* Screen-pinned sibling of World, never inside its camera transform:
        cloudEnter may overlap finalZoom without scaling the clouds.
        Only the original cover renderer; no Animation 9 playback or exit. */}
    {showClouds && state.cloudEnter > 0 && <div className="micro17-cover">
      <DitherClouds progress={state.cloudProgress} yOffset={27} translateY={state.cloudTranslateY} translateX={state.cloudTranslateX}/>
    </div>}
    {showSubtitles && <Subtitles progress={playback.progress}/>}
  </div>;
};
