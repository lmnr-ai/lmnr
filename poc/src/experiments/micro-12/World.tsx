import {useEffect, useId, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {AGENT as MICRO10_AGENT, MICRO_10_DEFAULTS, sampleMicro10} from '../micro-10/geometry';
import {DitherImage, DitherPhoto, DitherPuffs} from '../micro-10/DitherPhoto';
import {BLOCK_TEMPLATE, CELL, CELLS, GRID, PERIOD, offsetForCell, openingCloudBounds, visibleBlocks, type Controls, type WorldState} from './geometry';
import type {Progress} from './sample';
import {MICRO_12_TIMELINE} from './timeline';
import {Paper} from './Paper';

export const World = ({state: s, progress: p, controls, time}: {state: WorldState; progress: Progress; controls: Controls; time: number}) => {
  const id = `micro12-${useId().replace(/:/g, '')}`;
  const ref = (name: string) => `url(#${id}-${name})`;
  const [handle] = useState(() => delayRender('Load Animation 12 stream typography and icons'));
  useEffect(() => {
    let active = true;
    const font = new FontFace('Micro12Mono', `url("${staticFile('micro-07/JetBrainsMono-Regular.woff2')}")`);
    const assets = [staticFile('micro-12/warning.svg'), staticFile('micro-12/cloud-back.png'), staticFile('micro-12/cloud-front-flipped.png'), staticFile('micro-07/spinner.svg'),
      ...new Set(BLOCK_TEMPLATE.flatMap(block => block.asset ? [staticFile(`micro-07/${block.asset.replace('.svg', '-square.svg')}`)] : []))];
    Promise.all([font.load().then(loaded => {if (active) document.fonts.add(loaded);}), ...assets.map(src => new Promise<void>((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error(`Missing ${src}`)); image.src = src;
    }))]).then(() => continueRender(handle)).catch(cancelRender);
    return () => {active = false; document.fonts.delete(font);};
  }, [handle]);
  const halfCell = GRID.pitch / (2 * s.contentScale);
  const viewLeft = (s.cameraFocus - 640 / s.scale - s.gridOrigin.x) / s.contentScale - s.heroRebase.x;
  const viewRight = (s.cameraFocus + 640 / s.scale - s.gridOrigin.x) / s.contentScale - s.heroRebase.x;
  const left = Math.max(s.heroClipLeft, viewLeft);
  const right = Math.min(0, viewRight);
  const blocks = visibleBlocks(s.head, left, right, s.liftCycle);
  // Keep cyclic smoke sampling tied to the authored clip after timeline shifts.
  const smokeTime = Math.max(0, time - MICRO_12_TIMELINE.smokeEnter.at);
  const smoke = sampleMicro10(smokeTime, MICRO_10_DEFAULTS);
  const smokeVisible = p.smokeEnter > 0 && p.cameraBacktrack < 1;
  const recenterSmoke = ({x, y, width, height}: {x: number; y: number; width: number; height: number}) =>
    ({x: x - MICRO10_AGENT.x + 640, y, width, height});
  const scaleFromBottomRight = ({x, y, width, height}: {x: number; y: number; width: number; height: number}, scale: number) => ({
    x: x + width * (1 - scale), y: y + height * (1 - scale), width: width * scale, height: height * scale,
  });
  const smokeCloudBounds = scaleFromBottomRight(recenterSmoke(smoke.cloudBounds), p.smokeEnter);
  const smokePuffs = smoke.puffs.flatMap(({bounds, opacity, progress}) => {
    const age = progress * MICRO_10_DEFAULTS.puffLifetime;
    // Animation 10 is cyclic and includes emissions from before t=0. This shot
    // has a real beginning, so only retain puffs emitted by this smoke stack.
    if (age > smokeTime + 1e-6) return [];
    const birthScale = Math.min(1, age / .2);
    return [{bounds: scaleFromBottomRight(recenterSmoke(bounds), birthScale), opacity: opacity * birthScale * s.smokeOpacity}];
  });
  const openingBounds = (layer: 'back' | 'front') => {
    const xOffset = layer === 'back' ? controls.openingCloudBackXOffset : controls.openingCloudFrontXOffset;
    const bounds = openingCloudBounds(layer, s.head, p.firstThinking, xOffset);
    return {...bounds, x: bounds.x + 640, y: bounds.y + 360};
  };
  const liftFor = (kind: string) => kind === 'thinking-blue' ? p.thinkingLift : kind === 'read' ? p.readLift : p.redThinkingLift;
  const blockContent = (block: typeof BLOCK_TEMPLATE[number], x: number, first = false) => block.asset
    ? <image href={staticFile(`micro-07/${block.asset.replace('.svg', '-square.svg')}`)} x={x} y={-60} width={block.w} height={CELL}/>
    : <>{first
      ? <path d={`M${x + 60} -60H${x + block.w}V60H${x + 60}A60 60 0 0 1 ${x + 60} -60Z`} fill={ref(block.id)}/>
      : <rect x={x} y={-60} width={block.w} height={CELL} fill={ref(block.id)}/>}
      <text x={x + (block.textX ?? 32)} y={18} className="micro12-label">{block.label}</text></>;

  return <svg className="micro12-world" viewBox="0 0 1280 720" aria-label="Thinking, live stream, football zoom, straight backtrack, three paper lifts, then a field of agents">
    <defs>
      {BLOCK_TEMPLATE.filter(block => block.colors).map(block => <linearGradient key={block.id} id={`${id}-${block.id}`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor={block.colors![0]}/><stop offset="1" stopColor={block.colors![1]}/>
      </linearGradient>)}
      <pattern id={`${id}-stream`} width={PERIOD} height={CELL} y={-60} patternUnits="userSpaceOnUse" viewBox={`0 -60 ${PERIOD} ${CELL}`}>
        {BLOCK_TEMPLATE.map(block => <g key={block.id}>{blockContent(block, block.x + 60)}</g>)}
      </pattern>
      <pattern id={`${id}-grid`} width={CELL} height={CELL} y={-60} patternUnits="userSpaceOnUse"><path d="M0 0V120H120" fill="none" stroke="#333" strokeWidth="1"/></pattern>
      {/* Clip only at the agent. The left side must remain unbounded while the
          camera backtracks beyond the center cell's nominal boundary. */}
      <clipPath id={`${id}-visited`}><rect x={s.heroClipLeft} y={-400} width={s.heroClipWidth} height={900}/></clipPath>
      {CELLS.map(cell => {
        const offset = cell.hero ? 0 : offsetForCell(controls.streamSeed, cell.id);
        return <g key={cell.id}>
          <pattern id={`${id}-stream-${cell.id}`} href={`#${id}-stream`} x={-s.head - 60 - offset}/>
          <pattern id={`${id}-grid-${cell.id}`} href={`#${id}-grid`} x={-s.head - 60 - offset}/>
        </g>;
      })}
    </defs>
    <g transform={`translate(${640 - s.cameraFocus * s.scale} ${360 - s.cameraFocusY * s.scale}) scale(${s.scale})`}>
      {CELLS.map(cell => {
        const dotsOnly = !cell.hero && s.neighborsAreDots;
        const globalGrid = cell.hero && s.smallGridUbiquitous;
        const gridX = globalGrid ? (s.cameraFocus - 640 / s.scale - cell.x - s.gridOrigin.x) / s.contentScale - CELL : -halfCell;
        const gridY = globalGrid ? (s.cameraFocusY - 360 / s.scale - cell.y - s.gridOrigin.y) / s.contentScale - CELL : -halfCell;
        const gridWidth = globalGrid ? 1280 / (s.scale * s.contentScale) + CELL * 2 : halfCell * 2;
        const gridHeight = globalGrid ? 720 / (s.scale * s.contentScale) + CELL * 2 : halfCell * 2;
        return <g key={cell.id} transform={`translate(${cell.x + s.gridOrigin.x} ${cell.y + s.gridOrigin.y})`}>
          {/* The final lattice moves under the fixed warning subject. */}
          {cell.hero && <rect x={-GRID.pitch / 2} y={-GRID.pitch / 2} width={GRID.pitch} height={GRID.pitch} fill={s.centerCellColor}/>}
          {s.bigGridVisible && <path d={`M${-GRID.pitch / 2} ${-GRID.pitch / 2}V${GRID.pitch / 2}H${GRID.pitch / 2}`} fill="none" stroke="#333" strokeWidth="1" vectorEffect="non-scaling-stroke"/>}
          <g transform={`scale(${s.contentScale})`}>
            {!dotsOnly && s.smallGridOpacity > 0 && <rect x={gridX} y={gridY} width={gridWidth} height={gridHeight} fill={ref(`grid-${cell.id}`)} opacity={s.smallGridOpacity}/>}
            <g transform={cell.hero ? `translate(${s.heroRebase.x} ${s.heroRebase.y})` : undefined}>
              {cell.hero && p.firstThinking > 0 && <foreignObject x={-640} y={-360} width={1280} height={720} overflow="visible">
                <div style={{position: 'relative', width: 1280, height: 720}}>
                  <DitherImage bounds={openingBounds('back')} source={staticFile('micro-12/cloud-back.png')}/>
                </div>
              </foreignObject>}
              {cell.hero && smokeVisible && <foreignObject x={-640} y={-360} width={1280} height={720} overflow="visible">
                <div style={{position: 'relative', width: 1280, height: 720}}>
                  <DitherPuffs puffs={smokePuffs} brightness={smoke.puffBrightness}/>
                  <DitherPhoto bounds={smokeCloudBounds} opacity={s.smokeOpacity}/>
                </div>
              </foreignObject>}
              {!dotsOnly && s.streamVisible && s.streamHeight > 0 && <g transform={`scale(1 ${s.streamHeight})`}>
                {cell.hero ? <g clipPath={ref('visited')}>
                  {blocks.map(block => <g key={block.key}>
                    <g transform={`translate(0 ${block.lift ? -CELL * liftFor(block.id) : 0})`}>{blockContent(block, block.x, block.first)}</g>
                    {block.lift && liftFor(block.id) > 0 && <Paper x={block.x} width={block.w} kind={block.id} progress={liftFor(block.id)} highlight={p.highlight}/>}
                  </g>)}
                </g> : <rect x={-halfCell} y={-60} width={halfCell} height={CELL} fill={ref(`stream-${cell.id}`)}/>}
              </g>}
              <g opacity={cell.hero ? s.heroAgentOpacity : 1} transform={`scale(${cell.hero ? s.agentScale : 1})`}>
                <circle r={60} fill={dotsOnly ? '#4e4e4e' : s.dotColor}/>
                {!dotsOnly && s.loaderOpacity > 0 && <image href={staticFile('micro-07/spinner.svg')} x={-44.5} y={-44.5} width={89} height={89} opacity={s.loaderOpacity} transform={`rotate(${s.loaderAngle})`}/>}
              </g>
              {cell.hero && p.firstThinking > 0 && <foreignObject x={-640} y={-360} width={1280} height={720} overflow="visible">
                <div style={{position: 'relative', width: 1280, height: 720}}>
                  <DitherImage bounds={openingBounds('front')} source={staticFile('micro-12/cloud-front-flipped.png')}/>
                </div>
              </foreignObject>}
            </g>
          </g>
        </g>;
      })}
      {s.warning.scale > 0 && <g transform={`translate(${s.warning.x} ${s.warning.y}) scale(${s.warning.scale})`}>
        <image href={staticFile('micro-12/warning.svg')} x={-57.1345} y={-53.058} width={114.269} height={106.116}/>
      </g>}
    </g>
  </svg>;
};
