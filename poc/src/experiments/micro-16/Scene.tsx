import {useEffect, useId, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {DitherClouds} from '../micro-09/DitherClouds';
import {DitherPhoto, DitherPuffs} from '../micro-10/DitherPhoto';
import {ASSETS, BASH, BLOCKS, BUDGET, BUDGET_TRACE_Y, CHEAP_SPINNER_PATH, GRID, THINKING_PEEK, TRACE_PERIOD, TRACES, lerp} from './geometry';
import {HIGHLIGHT_LINES, PAPER_LINES, PAPER_LINE_HEIGHT} from './paper';
import {sampleMicro16, type Micro16State} from './sample';
import {Subtitles} from './Subtitles';

const asset = (name: string) => staticFile(`micro-16/${name}`);
const ToolBlock = ({x, y, width, label, source}: {x: number; y: number; width: number; label?: string; source?: string}) => source
  ? <image href={asset(source)} x={x} y={y} width={width} height={120}/>
  : <g><rect x={x} y={y} width={width} height={120} fill="#5c5c5c"/><text className="micro16-label" x={x + 32} y={y + 78}>{label}</text></g>;
const ThinkingPeek = ({state}: {state: Micro16State['thinkingPeek']}) => <g data-thinking-peek="true">
  {/* Contents paint first: the opaque door hides them until they peek over
      its top. No opacity/scale trick, and no lower-edge leakage on rewind. */}
  {state.warnings.map(warning => <g key={warning.asset} data-thinking-warning={warning.asset}
    transform={`translate(${warning.x} ${warning.y}) rotate(${warning.angle})`}>
    <image href={asset(warning.asset)} x={-THINKING_PEEK.warningWidth / 2} y={-THINKING_PEEK.warningHeight / 2}
      width={THINKING_PEEK.warningWidth} height={THINKING_PEEK.warningHeight}/>
  </g>)}
  <g data-thinking-door="true"><ToolBlock x={THINKING_PEEK.x} y={THINKING_PEEK.y + state.drop}
    width={THINKING_PEEK.width} label="Thinking..."/></g>
</g>;
const Trace = ({x, y, thinkingPeek}: {x: number; y: number; thinkingPeek?: Micro16State['thinkingPeek']}) => <g>{BLOCKS.map(block =>
  thinkingPeek && block.x === 360 ? <ThinkingPeek key={block.x} state={thinkingPeek}/>
    : <ToolBlock key={block.x} x={x + block.x} y={y} width={block.width}
      label={'label' in block ? block.label : undefined} source={'asset' in block ? block.asset : undefined}/>)}</g>;
const Agent = ({x, y, angle, fill, cheap = false, strokeWidth = 1.5}: {x: number; y: number; angle: number; fill: string; cheap?: boolean; strokeWidth?: number}) => <g data-agent={cheap ? 'cheap' : 'purple'} transform={`translate(${x} ${y})`}>
  <circle r={60} fill={fill}/>
  <g transform={`rotate(${angle})`}>
    {cheap ? <path d={CHEAP_SPINNER_PATH} transform="translate(-44.5 -44.5)" fill="none" stroke="black" strokeWidth={strokeWidth}/>
      : <image href={asset(ASSETS.purpleSpinner)} x={-43} y={-43.59} width={86} height={82.55}/>}
  </g>
</g>;
const BudgetBadge = ({state: s, id}: {state: Micro16State; id: string}) => {
  const remaining = s.budgetRemaining;
  // Finish the color transition at 25%; the final quarter stays fully red.
  const red = Math.min(1, (1 - remaining) / .75);
  const mix = (a: number[], b: number[]) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], red))).join(',')})`;
  return <g transform={`translate(${s.budgetAgent.x - BUDGET.width / 2} ${s.budgetAgent.y + BUDGET.offsetY})`} opacity={s.progress.budgetAppear}>
    <defs><linearGradient id={`${id}-budget`} x2="0" y2="1"><stop stopColor={mix([255, 231, 0], [239, 141, 143])}/><stop offset="1" stopColor={mix([248, 189, 28], [242, 116, 125])}/></linearGradient></defs>
    <rect width={259} height={50} fill="#5c5c5c"/>
    <rect width={259 * remaining} height={50} fill={`url(#${id}-budget)`}/>
    <circle cx={s.budgetMarker} cy={25} r={32} fill="white"/>
    <image href={asset(ASSETS.dollar)} x={s.budgetMarker - 9} y={4.5} width={18} height={41}/>
  </g>;
};

export const useMicro16RenderReady = () => {
  const [handle] = useState(() => delayRender('Load Animation 16 typography and Figma SVGs'));
  useEffect(() => {
    let active = true;
    const font = new FontFace('Micro16Mono', `url("${staticFile('micro-07/JetBrainsMono-Regular.woff2')}")`);
    Promise.all([font.load().then(loaded => {if (active) document.fonts.add(loaded);}), ...Object.values(ASSETS).map(name => new Promise<void>((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error(`Missing Animation16 asset ${name}`)); image.src = asset(name);
    }))]).then(() => continueRender(handle)).catch(cancelRender);
    return () => {active = false; document.fonts.delete(font);};
  }, [handle]);
};

/** Camera-free render content for compositions that own a larger world. */
export const Micro16WorldContent = ({state: s, id}: {state: Micro16State; id: string}) => {
  const p = s.progress;
  const firstTile = Math.floor((s.camera.x - 1800) / TRACE_PERIOD);
  return <>
    <defs>
      <linearGradient id={`${id}-yellow`} x2="0" y2="1"><stop stopColor="#fff9a8"/><stop offset="1" stopColor="#ebe262"/></linearGradient>
      <linearGradient id={`${id}-purple`} x2="0" y2="1"><stop stopColor="#bba8ff"/><stop offset="1" stopColor="#9a88dd"/></linearGradient>
    </defs>
    {TRACES.map((trace, row) => <Trace key={trace.y} {...trace} thinkingPeek={row === 1 ? s.thinkingPeek : undefined}/>)}
    {s.cheapAgents.map((agent, row) => <Agent key={row} {...agent} cheap strokeWidth={s.controls.cheapSpinnerStrokeWidth} fill={`url(#${id}-yellow)`}/>)}
    <ToolBlock x={-20} y={BASH.y} width={240} label="Write"/>
    <ToolBlock x={220} y={BASH.y} width={120} source={ASSETS.bashConnector}/>
    <ToolBlock x={BASH.x} y={BASH.y - 120 * p.bashExpand} width={360} label="Bash"/>
    <ToolBlock x={700} y={BASH.y} width={120} source={ASSETS.bashTool}/>
    <ToolBlock x={820} y={BASH.y} width={360} label="Thinking..."/>
    <ToolBlock x={1180} y={BASH.y} width={120} source={ASSETS.bashConnector}/>
    {/* This foreignObject is the genuine local paper-door mask, not a scene viewport. */}
    <foreignObject x={BASH.x} y={BASH.y} width={BASH.width} height={s.paperHeight}
      style={{overflow: 'hidden', clipPath: `inset(${120 * (1 - p.bashExpand)}px 0 0 0)`}}>
      <div className="micro16-paper" style={{transform: `translateY(${-120 * (1 - p.bashExpand)}px)`}}>
        {PAPER_LINES.map((line, index) => {
          const highlightIndex = HIGHLIGHT_LINES.indexOf(index);
          const amount = Math.max(0, Math.min(1, p.bashHighlight * HIGHLIGHT_LINES.length - highlightIndex));
          return <div className="micro16-paper-line" key={index} style={{height: PAPER_LINE_HEIGHT}}>{line}
            {highlightIndex >= 0 && <span className="micro16-highlight" style={{clipPath: `inset(0 ${100 * (1 - amount)}% 0 0)`}}>{line}</span>}
          </div>;
        })}
      </div>
    </foreignObject>
    <Agent {...s.bashAgent} fill={`url(#${id}-purple)`}/>
    <g transform={`translate(${s.warning.x + 43.3985} ${s.warning.y + 40.302}) scale(${s.warning.scale})`}>
      <image href={asset(ASSETS.warning)} x={-43.3985} y={-40.302} width={86.797} height={80.604}/>
    </g>
    {Array.from({length: 4}, (_, i) => <Trace key={firstTile + i} x={-20 + (firstTile + i) * TRACE_PERIOD} y={BUDGET_TRACE_Y}/>)}
    <Agent {...s.budgetAgent} fill={`url(#${id}-purple)`}/>
  </>;
};

/** Camera-free overlay content; it stays world-attached while painting last. */
export const Micro16BudgetContent = ({state, id}: {state: Micro16State; id: string}) => <BudgetBadge state={state} id={id}/>;

export const Micro16Scene = ({state: s = sampleMicro16(0)}: {state?: Micro16State}) => {
  const id = `micro16-${useId().replace(/:/g, '')}`;
  useMicro16RenderReady();
  return <div className="micro16-scene" aria-label="Cheap traces, deep bash inspection, then an exhausted agent budget" data-time={s.time}>
    <svg className="micro16-grid" viewBox="0 0 1280 720" aria-hidden="true">
      <defs><pattern id={`${id}-grid`} x={GRID.x} y={GRID.y} width={120} height={120} patternUnits="userSpaceOnUse"><path d="M.5 0V119.5H120" stroke="#333" fill="none"/></pattern></defs>
      <g transform={`translate(${-s.camera.x} ${-s.camera.y})`}>
        <rect x={s.camera.x - 120} y={s.camera.y - 120} width={1520} height={960} fill={`url(#${id}-grid)`}/>
      </g>
    </svg>
    {/* Explicit scoped z-indexes keep inherited canvas styles below every foreground element. */}
    <DitherPuffs puffs={s.puffs} brightness={.9}/>
    <DitherPhoto bounds={s.smokeBounds} opacity={s.smokeOpacity}/>
    <svg className="micro16-world" viewBox="0 0 1280 720"><g transform={`translate(${-s.camera.x} ${-s.camera.y})`}><Micro16WorldContent state={s} id={id}/></g></svg>
    <svg className="micro16-overlay" viewBox="0 0 1280 720"><g transform={`translate(${-s.camera.x} ${-s.camera.y})`}><Micro16BudgetContent state={s} id={id}/></g></svg>
    <DitherClouds {...s.cloud}/>
    <Subtitles progress={s.progress}/>
  </div>;
};
