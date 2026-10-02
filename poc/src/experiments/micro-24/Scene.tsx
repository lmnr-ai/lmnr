import {DitherClouds} from '../micro-09/DitherClouds';
import {Flow1WorldContent, useFlow1FontReady} from '../introducing-flow-1/Scene';
import {Subtitles} from './Subtitles';
import type {CoverMotion} from '../introducing-flow-1/geometry';
import {graphState, flow3WorldState, GRAPH_WORLD_ORIGIN} from './geometry';
import type {Flow3Playback} from './sample';
import {DEFAULT_BEAD_STAGGER_SECONDS} from './beads';
import {Micro23Scene} from '../micro-23/Scene';
import {clamp01} from '../micro-23/sample';
import {MICRO_23_DEFAULTS} from '../micro-23/timeline';
import {flow3Insert} from './insert';

export type Flow3Appearance = {cloudYOffset: number; blueDotScale: number; coverMotion: CoverMotion; mutedGray: string; beadStaggerSeconds: number};
export const FLOW_3_APPEARANCE: Flow3Appearance = {cloudYOffset: 37, blueDotScale: 1.2, coverMotion: 'split', mutedGray: '#474747', beadStaggerSeconds: DEFAULT_BEAD_STAGGER_SECONDS};

export const Flow3Intelligence = ({playback, beadStaggerSeconds = DEFAULT_BEAD_STAGGER_SECONDS}: {playback: Flow3Playback; beadStaggerSeconds?: number}) => {
  const graph = graphState(playback, beadStaggerSeconds);
  const p = playback.progress;
  return <div className="flow3-graph" style={{left: GRAPH_WORLD_ORIGIN.x, top: GRAPH_WORLD_ORIGIN.y}}>
    <div className="flow3-intelligence-points" style={{position: 'absolute', inset: 0, transform: `translateX(${-1500 * clamp01(p.stringExit)}px)`}}>
      <div className="flow3-string" style={{left: graph.string.x, opacity: graph.string.opacity}}/>
      <div className="flow3-ball" data-flow-point="true" style={{left: graph.ball.x, top: graph.ball.y, opacity: graph.ball.opacity}}>
        <i style={{left: -graph.ball.size / 2, top: -graph.ball.size / 2, width: graph.ball.size, height: graph.ball.size}}/>
      </div>
      <span className="flow3-flow-score" style={{left: graph.ball.x - 30, top: graph.ball.y - 16, opacity: graph.ball.opacity}}>{graph.ball.score}</span>
      {graph.points.map(point => <div key={point.id} className="flow3-model" data-model={point.id}
        data-desc-f1={point.descF1} data-traces-per-dollar={point.tracesPerDollar}
        style={{left: point.x, top: point.y, opacity: point.opacity, color: '#808080'}}>
        <i/>
        <span className="flow3-score" style={{left: 'auto', right: 30}}>{point.descF1.toFixed(1)}</span>
        <span style={{left: 30}}>{point.label}</span>
      </div>)}
      <span className="flow3-flow-label" style={{left: graph.flowLabel.x, top: graph.flowLabel.y, opacity: graph.ball.opacity}}>flow-1</span>
    </div>
    <div className="flow3-heading flow3-heading-intelligence">
      <div className="flow3-heading-slide" style={{transform: `translateY(${100 * (p.benchmarkHeading - 1 + p.intelligenceExit)}%)`}}>
        <span>Trace analysis<br/>intelligence</span>
      </div>
    </div>
  </div>;
};

export const FLOW_3_DENSE_GRID_COLOR = '#1f1f1f';

export const IntroducingFlow3Scene = ({playback, cloudYOffset = 37, blueDotScale = 1.2, coverMotion = FLOW_3_APPEARANCE.coverMotion, mutedGray = '#474747', beadStaggerSeconds = DEFAULT_BEAD_STAGGER_SECONDS}:
  {playback: Flow3Playback} & Partial<Flow3Appearance>) => {
  useFlow1FontReady();
  const state = flow3WorldState(playback);
  const insert = flow3Insert(playback);
  return <div className="flow1-scene flow3-scene" aria-label="Animation 24 — Introducing flow-1 3" style={{'--flow1-muted-gray': mutedGray} as React.CSSProperties}>
    <div className="flow1-world" style={{transform: `translate(${state.camera.x}px,${state.camera.y}px) scale(${state.camera.scale})`, '--flow1-border': `${1 / state.camera.scale}px`} as React.CSSProperties}>
      <div className="flow1-grid" style={{backgroundImage: `linear-gradient(#333 ${1 / state.camera.scale}px,transparent ${1 / state.camera.scale}px),linear-gradient(90deg,#333 ${1 / state.camera.scale}px,transparent ${1 / state.camera.scale}px)`}}/>
      <Flow1WorldContent taperDotRows state={state} time={playback.time} blueDotScale={blueDotScale} coverMotion={coverMotion} modelName="flow-1" benchmarkContent={<Flow3Intelligence playback={playback} beadStaggerSeconds={beadStaggerSeconds}/>}/>
    </div>
    {insert.active && <div className="flow3-micro23"><Micro23Scene sample={insert.sample} controls={MICRO_23_DEFAULTS} gridStrokeWidth={insert.gridStrokeWidth}/></div>}
    <DitherClouds progress={state.cloudProgress} yOffset={cloudYOffset} translateY={state.cloudTranslateY}/>
    <Subtitles progress={playback.progress}/>
  </div>;
};
