import {useId} from 'react';
import {zoomGridColor} from '../zoom-grid-color';
import {SlideReveal, useFlow1FontReady} from '../introducing-flow-1/Scene';
import {HEADLINE_BOUNDS, LABEL_BOUNDS, NUMBER_BOUNDS, type Micro23Sample} from './sample';
import {MICRO_23_DEFAULTS, type Micro23Controls} from './timeline';

function FixedBorder({width, height, color, className}: {width: number; height: number; color: string; className: string}) {
  return <svg className={`micro23-fixed-border ${className}`} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    {/* Clear the underlying grid edge to avoid double-painted antialiasing. */}
    <path d={`M.5 ${height}V.5H${width}`} fill="none" stroke="#1a1a1a" strokeWidth={1}/>
    <path data-frame-stroke="true" d={`M.25 ${height}V.25H${width}`} fill="none" stroke={color} strokeWidth={.5}/>
  </svg>;
}

type GridProps = {sample: Micro23Sample; controls?: Micro23Controls; gridStrokeWidth?: number; gridOffset?: {x: number; y: number}};

/** Shared grid primitive also sits behind the engine during Ultimate 3's handoff. */
export function Micro23Grid({sample, controls = MICRO_23_DEFAULTS, gridStrokeWidth = .5, gridOffset}: GridProps) {
  const pattern = `micro23-grid-${useId().replace(/:/g, '')}`;
  const gridColor = zoomGridColor(controls.gridColor, sample.progress.gridShrink * (1 - sample.progress.returnToGrid));
  return <svg className="micro23-grid" viewBox="0 0 1280 720" aria-label="Infinite lined grid">
    <defs><pattern id={pattern} x={640 + (gridOffset?.x ?? 0)} y={sample.gridY + (gridOffset?.y ?? 0)} width={sample.cellSize} height={sample.cellSize} patternUnits="userSpaceOnUse">
      <path d={`M0 ${gridStrokeWidth / 2}H${sample.cellSize}M${gridStrokeWidth / 2} 0V${sample.cellSize}`} fill="none" stroke={gridColor} strokeWidth={gridStrokeWidth}/>
    </pattern></defs>
    <rect x={-1280} y={-720} width={3840} height={2160} fill={`url(#${pattern})`}/>
  </svg>;
}

export function Micro23Scene({sample, controls = MICRO_23_DEFAULTS, gridStrokeWidth = .5, gridOffset, worldTransform, showGrid = true, transparent = false}: GridProps & {worldTransform?: string; showGrid?: boolean; transparent?: boolean}) {
  useFlow1FontReady();
  const p = sample.progress;
  const gridColor = zoomGridColor(controls.gridColor, p.gridShrink * (1 - p.returnToGrid));
  const boxStyle = (box: {x: number; y: number; width: number; height: number}) => ({left: box.x, top: box.y, width: box.width, height: box.height});
  const labelBorder = <svg className="micro23-label-border" viewBox="0 0 180 40" aria-hidden="true">
    <path d="M.25 40V.25H180" fill="none" stroke={gridColor} strokeWidth={.5}/>
  </svg>;
  return <div className="micro23-scene" aria-label="Animation 23 - Traces per dollar" data-time={sample.time} data-cell-size={sample.cellSize} style={transparent ? {background: 'transparent'} : undefined}>
    {showGrid && <Micro23Grid sample={sample} controls={controls} gridStrokeWidth={gridStrokeWidth} gridOffset={gridOffset}/>}
    <div className="micro23-world" style={{transform: worldTransform ?? (gridOffset ? `translate(${gridOffset.x}px,${sample.gridY - 350 + gridOffset.y}px) scale(${sample.worldScale})` : `translateY(${sample.gridY - 350}px) scale(${sample.worldScale})`), ...(worldTransform ? {transformOrigin: '0 0'} : {})}}>
      <div className="micro23-fold-frame micro23-headline" style={{...boxStyle(HEADLINE_BOUNDS), visibility: sample.headlineContainerVisible ? 'visible' : 'hidden'}}>
        {/* Separate masks keep early/overlapping exit edits from revealing unentered text. */}
        <div className="micro23-headline-exit" style={{transform: `translateY(${sample.headlineSlideOutProgress * 100}%)`}}>
          <SlideReveal progress={p.headlineReveal} className="micro23-headline-reveal">
            <span>20x more traces analyzed per dollar</span>
          </SlideReveal>
        </div>
        {/* Fixed frame: never part of the moving, background-colored card. */}
        <FixedBorder {...HEADLINE_BOUNDS} color={gridColor} className="micro23-headline-border"/>
      </div>
      <svg className="micro23-dots" viewBox="0 0 1280 720" aria-label="Traces per dollar dot field">
        {sample.dots.map(dot => <circle key={dot.index} data-dot={dot.index} data-color={dot.color} data-row={dot.row}
          cx={dot.x} cy={dot.y} r={controls.dotDiameter / 2 * dot.progress} opacity={dot.progress}
          fill={dot.color === 'orange' ? controls.orangeColor : controls.blueColor}/>) }
      </svg>
      <div className="micro23-label-box" style={boxStyle(LABEL_BOUNDS.gpt)}><SlideReveal progress={p.gptLabel} className="micro23-label"><span>gpt-6 sol</span>{labelBorder}</SlideReveal></div>
      <div className="micro23-label-box" style={boxStyle(LABEL_BOUNDS.flow)}><SlideReveal progress={p.flowLabel} className="micro23-label"><span>flow-1</span>{labelBorder}</SlideReveal></div>
      {(['gpt', 'flow'] as const).map(model => <div key={model} className="micro23-fold-frame micro23-number"
        style={{...boxStyle(NUMBER_BOUNDS[model]), visibility: sample.numberContainersVisible[model] ? 'visible' : 'hidden'}} data-number={model}>
        <SlideReveal progress={p[model === 'gpt' ? 'gptNumber' : 'flowNumber']} className="micro23-number-reveal">
          <span>{sample.numbers[model]}</span>
        </SlideReveal>
        <FixedBorder {...NUMBER_BOUNDS[model]} color={gridColor} className="micro23-number-border"/>
      </div>)}
    </div>
  </div>;
}
