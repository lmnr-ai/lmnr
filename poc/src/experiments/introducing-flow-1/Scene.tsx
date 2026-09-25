import {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {DitherClouds} from '../micro-09/DitherClouds';
import {BENCHMARKS, benchmarkPercentLabel, BENCHMARK_WORLD_X, BENCHMARK_WORLD_Y, ENGINE_WORLD_X, ENGINE_WORLD_Y, coverGeometry, DOT, sampleFlowDots, introducingFlowState, LINE_PITCH, LINE_STRIP, staggeredRevealProgress, settledWorldLength, type CoverMotion} from './geometry';
import type {FlowPlayback} from './sample';
import {Subtitles} from './Subtitles';

const ASSET = 'introducing-flow-1/assets/';
const worldStyle = (state: ReturnType<typeof introducingFlowState>) => ({
  transform: `translate(${state.camera.x}px,${state.camera.y}px) scale(${state.camera.scale})`,
  '--flow1-border': `${1 / state.camera.scale}px`,
});

export const SlideReveal = ({progress, className = '', children}: {progress: number; className?: string; children: React.ReactNode}) => <div className={`flow1-mask ${className}`}>
  <div className="flow1-slide" style={{transform: `translateY(${(-1 + progress) * 100}%)`}}>{children}</div>
</div>;

const GridWorld = ({state, time, blueDotScale, coverMotion, numberRowStagger}: {state: ReturnType<typeof introducingFlowState>; time: number; blueDotScale: number; coverMotion: CoverMotion; numberRowStagger: number}) => <div className="flow1-world" style={worldStyle(state)}>
  <div className="flow1-grid" style={{backgroundImage: `linear-gradient(#333 ${1 / state.camera.scale}px,transparent ${1 / state.camera.scale}px),linear-gradient(90deg,#333 ${1 / state.camera.scale}px,transparent ${1 / state.camera.scale}px)`}}/>
  <Flow1WorldContent state={state} time={time} blueDotScale={blueDotScale} coverMotion={coverMotion} numberRowStagger={numberRowStagger}/>
</div>;

const BenchmarkRows = ({state, time, numberRowStagger}: {state: ReturnType<typeof introducingFlowState>; time: number; numberRowStagger: number}) => <div className="flow1-benchmark" style={{left: BENCHMARK_WORLD_X, top: BENCHMARK_WORLD_Y}}>
  <SlideReveal progress={state.benchmarkHeading} className="flow1-heading flow1-heading-left"><span>{'Trace analysis '}<br/>intelligence</span></SlideReveal>
  <div className="flow1-rows">
    {BENCHMARKS.map((row, rowIndex) => {
      const rowReveal = rowIndex === 0 || numberRowStagger === 0 ? state.modelRows
        : staggeredRevealProgress(time, state.modelRowsTiming, rowIndex, numberRowStagger);
      const numberReveal = rowIndex === 0 || numberRowStagger === 0 ? state.percentageReveal
        : staggeredRevealProgress(time, state.percentageRevealTiming, rowIndex, numberRowStagger);
      const count = Math.round(row.count * state.analysisCountUp);
      const flowPercent = benchmarkPercentLabel(row.id, row.percent, state.percentageCountUp);
      return <div className="flow1-row" key={row.id} data-model={row.id}>
        <div className="flow1-number-mask">
          <div className="flow1-number flow1-number-old" style={{transform: `translateY(${(-1 + numberReveal + state.numberSwap) * 100}%)`}}>{flowPercent}</div>
          <div className="flow1-number flow1-number-new" style={{transform: `translateY(${(-1 + state.numberSwap) * 100}%)`}}>{count}</div>
        </div>
        <SlideReveal progress={rowReveal} className="flow1-name-mask">
          <div className="flow1-row-content" style={{gap: settledWorldLength(12 + 8 * state.barsGrow)}}>
            <span className="flow1-bar" style={{width: settledWorldLength(row.barScreen * state.barsGrow), backgroundImage: row.id === 'flow' ? `url(${staticFile(`${ASSET}245257bb755e62097f62ab86c08faff4f0d0b5c7.png`)})` : undefined}}/>
            <span style={{width: settledWorldLength(row.nameWidthScreen)}}>{row.name}</span>
          </div>
        </SlideReveal>
      </div>;
    })}
  </div>
  <SlideReveal progress={state.analysisHeading} className="flow1-heading flow1-heading-right"><span>Traces analyzed<br/>per dollar</span></SlideReveal>
</div>;

const SPLIT_SPINNER_ROTATION = 55.75;
const CoverFace = ({state, size, split = false}: {state: ReturnType<typeof introducingFlowState>; size: number; split?: boolean}) => {
  const rotation = (split ? SPLIT_SPINNER_ROTATION : 0) + state.coverAngle;
  return <div className="flow1-cover-face" style={{width: size, height: size, backgroundImage: `linear-gradient(to bottom,rgba(168,202,255,${state.coverTint}),rgba(117,171,255,${state.coverTint}))`}}>
    <img className="flow1-cover-loader" src={staticFile(`${ASSET}111ef181d19f6460e93e32219ecf01174f626a8d.svg`)} style={{opacity: 1 - state.coverTint, transform: `rotate(${rotation}deg)`}}/>
    <img className="flow1-cover-loader" src={staticFile(`${ASSET}c2c86b15f174d7c343dc01fc0325a94a36768e05.svg`)} style={{opacity: state.coverTint, transform: `rotate(${rotation}deg)`}}/>
  </div>;
};

const Engine = ({state, coverMotion}: {state: ReturnType<typeof introducingFlowState>; coverMotion: CoverMotion}) => {
  const cover = coverGeometry(state.cover, coverMotion);
  return <div className="flow1-engine" data-cover-direction={coverMotion} style={{left: ENGINE_WORLD_X, top: ENGINE_WORLD_Y}}>
    <div className="flow1-ring" style={{transform: `translateX(${cover.ringX}px)`}}>
      <div className="flow1-assembly">
        <div className="flow1-module" style={{backgroundImage: `linear-gradient(to bottom,rgba(168,202,255,${state.activation}),rgba(117,171,255,${state.activation}))`}}>Flow-1</div>
        <div className="flow1-connector"><span className="flow1-connector-band" style={{maskImage: `url(${staticFile(`${ASSET}011f700148d25ee43048024995fe844266e054bd.svg`)})`, WebkitMaskImage: `url(${staticFile(`${ASSET}011f700148d25ee43048024995fe844266e054bd.svg`)})`}}/><img className="flow1-connector-stroke" src={staticFile(`${ASSET}e09ae89f7db0ecfa3f1abc58b8cc767c097cc836.svg`)}/></div>
        <div className="flow1-spinner"><i className="flow1-spinner-disc" style={{transform: `rotate(${state.spinnerAngle}deg)`}}/></div>
        <div className="flow1-lines">{Array.from({length: LINE_STRIP.tileCount}, (_, i) => <img
          key={i}
          src={staticFile(`${ASSET}99a27f841624c57b67238f0d5a92d01f446e8255.svg`)}
          style={{
            left: LINE_STRIP.left,
            top: LINE_STRIP.top + (i - 1) * LINE_STRIP.pathsPerTile * LINE_PITCH - state.lineOffset,
            width: LINE_STRIP.width,
            height: LINE_STRIP.height,
          }}
        />)}</div>
      </div>
    </div>
    {coverMotion === 'split' ? <>
      <div className="flow1-cover-door flow1-cover-door-left" style={{left: cover.leftDoorX, top: cover.coverY, width: cover.size / 2, height: cover.size}}>
        <CoverFace state={state} size={cover.size} split/>
      </div>
      <div className="flow1-cover-door flow1-cover-door-right" style={{left: cover.rightDoorX, top: cover.coverY, width: cover.size / 2, height: cover.size}}>
        <div style={{position: 'absolute', left: -cover.size / 2}}><CoverFace state={state} size={cover.size} split/></div>
      </div>
    </> : <div className="flow1-cover" style={{left: cover.coverX, top: cover.coverY, width: cover.size, height: cover.size}}>
      <CoverFace state={state} size={cover.size}/>
    </div>}
  </div>;
};

/** Camera- and grid-free content for compositions that own a larger world. */
export const Flow1WorldContent = ({state, time, blueDotScale, coverMotion, numberRowStagger = .05}: {state: ReturnType<typeof introducingFlowState>; time: number; blueDotScale: number; coverMotion: CoverMotion; numberRowStagger?: number}) => {
  const dots = sampleFlowDots(time).map(({row, column, colored}) =>
    <i key={`${row}:${column}`} className="flow1-dot" data-colored={colored} style={{left: column * 100 + DOT.cellLeft, top: row * 100 + DOT.cellTop, transform: `scale(${(colored ? blueDotScale : 1) * state.dotScale})`}}/>
  );
  return <>
    <div className="flow1-dots">{dots}</div>
    <div className="flow1-title">Flow-1</div>
    <BenchmarkRows state={state} time={time} numberRowStagger={numberRowStagger}/>
    <Engine state={state} coverMotion={coverMotion}/>
  </>;
};

export const useFlow1FontReady = () => {
  const [fontHandle] = useState(() => delayRender('Load Flow-1 typography'));
  useEffect(() => {
    // Export must wait for actual glyph metrics, not just CSS font-display.
    const font = new FontFace('FlowMono', `url("${staticFile('micro-09/JetBrainsMono-Regular.woff2')}")`);
    let active = true;
    font.load().then(loaded => {
      if (active) document.fonts.add(loaded);
      continueRender(fontHandle);
    }).catch(cancelRender);
    return () => { active = false; document.fonts.delete(font); };
  }, [fontHandle]);
};

export const IntroducingFlow1Scene = ({playback, cloudYOffset = 37, blueDotScale = 1.2, numberRowStagger = .05, coverMotion = 'top', mutedGray = '#474747'}: {playback: FlowPlayback; cloudYOffset?: number; blueDotScale?: number; numberRowStagger?: number; coverMotion?: CoverMotion; mutedGray?: string}) => {
  useFlow1FontReady();
  const state = introducingFlowState(playback);
  return <div className="flow1-scene" aria-label="Animation 13 - Introducing Flow-1" style={{'--flow1-muted-gray': mutedGray} as React.CSSProperties}>
    <GridWorld state={state} time={playback.time} blueDotScale={blueDotScale} coverMotion={coverMotion} numberRowStagger={numberRowStagger}/>
    <DitherClouds progress={state.cloudProgress} yOffset={cloudYOffset} translateY={state.cloudTranslateY}/>
    <Subtitles progress={playback.progress}/>
  </div>;
};
