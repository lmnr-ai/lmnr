import type {CSSProperties} from 'react';
import {Micro09Scene} from '../micro-09/Scene';
import {SPARKLE_DEFAULTS} from '../micro-09/sparkle';
import {DEFAULTS, worldState, type Controls} from './geometry';
import type {Playback} from './sample';
import {World} from './World';
import {Subtitles} from './Subtitles';

export const Micro12Scene = ({playback, controls = DEFAULTS}: {playback: Playback; controls?: Controls}) => {
  const state = worldState(playback, controls);
  return <div className="micro12-composition">
    <div style={{position: 'absolute', inset: 0, opacity: 1 - state.gridBlend}}>
      <World state={state} progress={playback.progress} controls={controls} time={playback.time}/>
    </div>
    {/* Warning focus lands the final lattice at screen center. Blend to the
        exact Animation 9 scene beneath cloud cover, without restarting clouds. */}
    <div className="micro12-finale" style={{
      visibility: state.cloudEnter > 0 ? 'visible' : 'hidden',
      '--grid-blend': state.gridBlend,
    } as CSSProperties}>
      <Micro09Scene {...state.finale} seed={209} sparkle={SPARKLE_DEFAULTS} cloudYOffset={27}
        cloudTranslateY={(1 - state.cloudEnter) * 720} cloudTranslateX={state.cloudTranslateX} signalsYOffset={-36}/>
    </div>
    <Subtitles progress={playback.progress}/>
  </div>;
};
