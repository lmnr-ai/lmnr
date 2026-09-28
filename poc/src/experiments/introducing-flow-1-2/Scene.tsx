import {DitherClouds} from '../micro-09/DitherClouds';
import {Flow1WorldContent, SlideReveal, useFlow1FontReady} from '../introducing-flow-1/Scene';
import {Subtitles} from './Subtitles';
import type {CoverMotion} from '../introducing-flow-1/geometry';
import {graphState, graphAxesState, flow2WorldState, GRAPH_WORLD_ORIGIN, AXIS_TICKS} from './geometry';
import type {Flow2Playback} from './sample';
import {DEFAULT_BEAD_STAGGER_SECONDS} from './beads';

export type Flow2Appearance = {cloudYOffset: number; blueDotScale: number; coverMotion: CoverMotion; mutedGray: string; beadStaggerSeconds: number};
export const FLOW_2_APPEARANCE: Flow2Appearance = {cloudYOffset: 37, blueDotScale: 1.2, coverMotion: 'split', mutedGray: '#474747', beadStaggerSeconds: DEFAULT_BEAD_STAGGER_SECONDS};

export const Flow2Graph = ({playback, beadStaggerSeconds = DEFAULT_BEAD_STAGGER_SECONDS}: {playback: Flow2Playback; beadStaggerSeconds?: number}) => {
  const graph = graphState(playback, beadStaggerSeconds);
  const axes = graphAxesState(playback);
  const p = playback.progress;
  return <div className="flow2-graph" style={{left: GRAPH_WORLD_ORIGIN.x, top: GRAPH_WORLD_ORIGIN.y}}>
    <div className="flow2-string" style={{left: graph.string.x, opacity: graph.string.opacity}}/>
    <div className="flow2-crossbar" style={{left: graph.ball.x, top: graph.ball.y, opacity: graph.string.crossbar}}/>
    <div className="flow2-ball" data-flow-point="true" style={{left: graph.ball.x, top: graph.ball.y, opacity: graph.ball.opacity}}>
      <i style={{left: -graph.ball.size / 2, top: -graph.ball.size / 2, width: graph.ball.size, height: graph.ball.size}}/>
    </div>
    <span className="flow2-flow-score" style={{left: graph.ball.x - 30, top: graph.ball.y - 16, opacity: graph.ball.opacity * graph.scoresOpacity}}>{graph.ball.score}</span>
    {graph.points.map(point => <div key={point.id} className="flow2-model" data-model={point.id}
      data-desc-f1={point.descF1} data-traces-per-dollar={point.tracesPerDollar}
      style={{left: point.x, top: point.y, opacity: point.opacity, color: '#808080'}}>
      <i/>
      <span className="flow2-score" style={{left: 'auto', right: 30, opacity: graph.scoresOpacity}}>{point.descF1.toFixed(1)}</span>
      <span style={{left: 30 * (1 - 2 * point.labelFlip), transform: `translateX(${-100 * point.labelFlip}%)`}}>{point.label}</span>
    </div>)}
    <div className="flow2-heading flow2-heading-intelligence">
      <div className="flow2-heading-slide" style={{transform: `translateY(${100 * (p.benchmarkHeading - 1 + p.benchmarkHeadingExit)}%)`}}>
        <span>Trace analysis<br/>intelligence</span>
      </div>
    </div>
    <SlideReveal progress={p.analysisHeading} className="flow2-heading flow2-heading-value">
      <span>20x more traces<br/>analyzed per dollar</span>
    </SlideReveal>
    <span className="flow2-flow-label" style={{left: graph.flowLabel.x, top: graph.flowLabel.y, opacity: graph.ball.opacity}}>flow-1</span>
    <div className="flow2-axis flow2-axis-y" aria-hidden={!axes.y.visible} style={{left: axes.y.x, visibility: axes.y.visible ? 'visible' : 'hidden'}}>
      <span className="flow2-axis-title">Trace analysis intelligence</span>
      {AXIS_TICKS.y.map(tick => <span key={tick.position} className="flow2-axis-tick flow2-axis-tick-y" data-value={tick.value} style={{top: tick.position}}>{tick.label}</span>)}
    </div>
    <div className="flow2-axis flow2-axis-x" aria-hidden={!axes.x.visible} style={{top: axes.x.y, visibility: axes.x.visible ? 'visible' : 'hidden'}}>
      <span className="flow2-axis-title">Traces analyzed per dollar</span>
      {AXIS_TICKS.x.map(tick => <span key={tick.position} className="flow2-axis-tick flow2-axis-tick-x" data-value={tick.value} style={{left: tick.position}}>{tick.label}</span>)}
    </div>
  </div>;
};

export const IntroducingFlow2Scene = ({playback, cloudYOffset = 37, blueDotScale = 1.2, coverMotion = FLOW_2_APPEARANCE.coverMotion, mutedGray = '#474747', beadStaggerSeconds = DEFAULT_BEAD_STAGGER_SECONDS}:
  {playback: Flow2Playback} & Partial<Flow2Appearance>) => {
  useFlow1FontReady();
  const state = flow2WorldState(playback);
  return <div className="flow1-scene flow2-scene" aria-label="Animation 21 — Introducing flow-1 2" style={{'--flow1-muted-gray': mutedGray} as React.CSSProperties}>
    <div className="flow1-world" style={{transform: `translate(${state.camera.x}px,${state.camera.y}px) scale(${state.camera.scale})`, '--flow1-border': `${1 / state.camera.scale}px`} as React.CSSProperties}>
      <div className="flow1-grid" style={{backgroundImage: `linear-gradient(#333 ${1 / state.camera.scale}px,transparent ${1 / state.camera.scale}px),linear-gradient(90deg,#333 ${1 / state.camera.scale}px,transparent ${1 / state.camera.scale}px)`}}/>
      <Flow1WorldContent state={state} time={playback.time} blueDotScale={blueDotScale} coverMotion={coverMotion} modelName="flow-1" benchmarkContent={<Flow2Graph playback={playback} beadStaggerSeconds={beadStaggerSeconds}/>}/>
    </div>
    <DitherClouds progress={state.cloudProgress} yOffset={cloudYOffset} translateY={state.cloudTranslateY}/>
    <Subtitles progress={playback.progress}/>
  </div>;
};
