import {useEffect, useId, useState, type ReactNode} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {AGENT as MICRO10_AGENT, MICRO_10_DEFAULTS, sampleMicro10} from '../micro-10/geometry';
import {DitherImage, DitherPhoto, DitherPuffs} from '../micro-10/DitherPhoto';
import {BLOCK_TEMPLATE, TURN_BLOCKS, CELL, CELLS, GRID, openingCloudBounds, visibleRouteBlocks, type Controls, type WorldState, type RouteBlock} from './geometry';
import type {Playback} from './sample';
import {Paper} from './Paper';

export const World = ({state: s, playback, controls}: {state: WorldState; playback: Playback; controls: Controls}) => {
  const p = playback.progress;
  const id = `micro17-${useId().replace(/:/g, '')}`;
  const ref = (name: string) => `url(#${id}-${name})`;
  const [handle] = useState(() => delayRender('Load Animation 17 stream typography and icons'));
  useEffect(() => {
    let active = true;
    const font = new FontFace('Micro17Mono', `url("${staticFile('micro-07/JetBrainsMono-Regular.woff2')}")`);
    const assets = [staticFile('micro-12/warning.svg'), staticFile('micro-12/cloud-back.png'), staticFile('micro-12/cloud-front-flipped.png'), staticFile('micro-07/spinner.svg'),
      ...new Set([...BLOCK_TEMPLATE, ...TURN_BLOCKS].flatMap(block => block.asset ? [staticFile(`micro-07/${block.asset.replace('.svg', '-square.svg')}`)] : []))];
    Promise.all([font.load().then(loaded => {if (active) document.fonts.add(loaded);}), ...assets.map(src => new Promise<void>((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error(`Missing ${src}`)); image.src = src;
    }))]).then(() => continueRender(handle)).catch(cancelRender);
    return () => {active = false; document.fonts.delete(font);};
  }, [handle]);
  const viewLeft = (s.cameraFocus - 640 / s.scale) / s.contentScale - s.heroRebase.x;
  const viewRight = (s.cameraFocus + 640 / s.scale) / s.contentScale - s.heroRebase.x;
  const blocks = visibleRouteBlocks(s, viewLeft, viewRight);
  const smoke = sampleMicro10(playback.smokeTime, MICRO_10_DEFAULTS);
  const smokeVisible = p.smokeEnter > 0 && p.cameraBacktrack < 1;
  const recenterSmoke = ({x, y, width, height}: {x: number; y: number; width: number; height: number}) =>
    ({x: x - MICRO10_AGENT.x + 640, y: y + s.agentY, width, height});
  const scaleFromBottomRight = ({x, y, width, height}: {x: number; y: number; width: number; height: number}, scale: number) => ({
    x: x + width * (1 - scale), y: y + height * (1 - scale), width: width * scale, height: height * scale,
  });
  const smokeCloudBounds = scaleFromBottomRight(recenterSmoke(smoke.cloudBounds), p.smokeEnter);
  const smokePuffs = smoke.puffs.flatMap(({bounds, opacity, progress}) => {
    const age = progress * MICRO_10_DEFAULTS.puffLifetime;
    if (age > playback.smokeTime + 1e-6) return [];
    const birthScale = Math.min(1, age / .2);
    return [{bounds: scaleFromBottomRight(recenterSmoke(bounds), birthScale), opacity: opacity * birthScale}];
  });
  const openingBounds = (layer: 'back' | 'front') => {
    const xOffset = layer === 'back' ? controls.openingCloudBackXOffset : controls.openingCloudFrontXOffset;
    const bounds = openingCloudBounds(layer, s.head, p.firstThinking, xOffset);
    return {...bounds, x: bounds.x + 640, y: bounds.y + 360};
  };
  const liftFor = (kind: string) => kind === 'thinking-blue' ? p.thinkingLift : kind === 'read' ? p.readLift : p.redThinkingLift;
  const camera = `translate(${640 - s.cameraFocus * s.scale} 360) scale(${s.scale})`;
  const hero = `scale(${s.contentScale}) translate(${s.heroRebase.x} ${s.heroRebase.y})`;
  const layer = (name: string, children: ReactNode) => <svg key={name} className={`micro17-world micro17-${name}`} viewBox="0 0 1280 720" aria-hidden="true">
    <g transform={camera}>{children}</g>
  </svg>;
  const imageLayer = (children: ReactNode) => <g transform={hero}><foreignObject x={-640} y={-360} width={1280} height={720} overflow="visible">
    <div style={{position: 'relative', width: 1280, height: 720}}>{children}</div>
  </foreignObject></g>;
  const blockContent = (block: RouteBlock) => block.asset
    ? <g clipPath={block.outline ? ref(`${block.key}-outline`) : undefined}><image href={staticFile(`micro-07/${block.asset.replace('.svg', '-square.svg')}`)} x={block.x} y={block.y} width={block.w} height={block.h}/></g>
    : <>{block.first
      ? <path d={`M${block.x + 60} -60H${block.x + block.w}V60H${block.x + 60}A60 60 0 0 1 ${block.x + 60} -60Z`} fill={ref(`${block.key}-paint`)}/>
      : <rect x={block.x} y={block.y} width={block.w} height={block.h} fill={ref(`${block.key}-paint`)}/>}
      {block.vertical ? <foreignObject x={block.x} y={block.y} width={block.w} height={block.h}>
        <div className="micro17-vertical-label">{block.label}</div>
      </foreignObject> : <text x={block.x + (block.textX ?? 32)} y={block.y + 78} className="micro17-label">{block.label}</text>}</>;

  return <div className="micro17-world-layers" data-camera-scale={s.scale} data-head={s.head} data-agent-y={s.agentY}>
    {layer('grid', <>
      <defs><pattern id={`${id}-grid-pattern`} width={CELL} height={CELL} x={-s.head - 60} y={-60} patternUnits="userSpaceOnUse"><path d="M0 0V120H120" fill="none" stroke="#333" strokeWidth="1"/></pattern></defs>
      {s.bigGridVisible && CELLS.map(cell => <g key={cell.id} transform={`translate(${cell.x} ${cell.y})`}>
        <path d={`M${-GRID.pitch / 2} ${-GRID.pitch / 2}V${GRID.pitch / 2}H${GRID.pitch / 2}`} fill="none" stroke="#333" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
        {!cell.hero && <circle r={60 * s.contentScale} fill="#4e4e4e"/>}
      </g>)}
      {s.smallGridOpacity > 0 && <g transform={`scale(${s.contentScale})`}>
        <rect x={(s.cameraFocus - 640 / s.scale) / s.contentScale - CELL} y={-360 / (s.scale * s.contentScale) - CELL}
          width={1280 / (s.scale * s.contentScale) + CELL * 2} height={720 / (s.scale * s.contentScale) + CELL * 2}
          fill={ref('grid-pattern')} opacity={s.smallGridOpacity}/>
      </g>}
    </>)}
    {p.firstThinking > 0 && layer('opening-back', imageLayer(<DitherImage bounds={openingBounds('back')} source={staticFile('micro-12/cloud-back.png')}/>))}
    {smokeVisible && layer('smoke', imageLayer(<>
      <DitherPuffs puffs={smokePuffs} brightness={smoke.puffBrightness}/>
      <DitherPhoto bounds={smokeCloudBounds}/>
    </>))}
    {layer('trace', <>
      <defs>
        {s.heroClip && <clipPath id={`${id}-cell-clip`}><rect {...s.heroClip}/></clipPath>}
        {blocks.map(block => <g key={block.key}>
          {block.colors && <linearGradient id={`${id}-${block.key}-paint`} x1="0" y1="0" x2={block.vertical ? 0 : 1} y2={block.vertical ? 1 : 0}>
            <stop offset="0" stopColor={block.colors[0]}/><stop offset="1" stopColor={block.colors[1]}/>
          </linearGradient>}
          <clipPath id={`${id}-${block.key}-reveal`} clipPathUnits="userSpaceOnUse">
            {block.reveal.rects.map((rect, i) => <rect key={i} {...rect}/>)}
            {block.reveal.circles.map((circle, i) => <circle key={i} {...circle}/>)}
          </clipPath>
          {block.outline && <clipPath id={`${id}-${block.key}-outline`}><path d={block.outline} transform={`translate(${block.x} ${block.y})`}/></clipPath>}
        </g>)}
      </defs>
      <g transform={hero} clipPath={s.heroClip ? ref('cell-clip') : undefined}>
        {s.streamVisible && s.streamHeight > 0 && <g transform={`scale(1 ${s.streamHeight})`}>
          {blocks.map(block => <g key={block.key} data-block={block.key}>
            {/* Visited masks move WITH headers; paper stays clipped in its own original column. */}
            <g transform={`translate(0 ${block.lift ? -CELL * liftFor(block.id) : 0})`}>
              <g clipPath={block.reveal.complete ? undefined : ref(`${block.key}-reveal`)}>{blockContent(block)}</g>
            </g>
            {block.lift && block.reveal.complete && liftFor(block.id) > 0 && <Paper x={block.x} width={block.w} kind={block.id} progress={liftFor(block.id)} highlight={p.highlight}/>}
          </g>)}
        </g>}
        <g opacity={s.heroAgentOpacity} transform={`translate(0 ${s.agentY}) scale(${s.agentScale})`}>
          <circle r={60} fill={s.dotColor}/>
          {s.loaderOpacity > 0 && <image href={staticFile('micro-07/spinner.svg')} x={-44.5} y={-44.5} width={89} height={89} opacity={s.loaderOpacity} transform={`rotate(${s.loaderAngle})`}/>}
        </g>
      </g>
    </>)}
    {p.firstThinking > 0 && layer('opening-front', imageLayer(<DitherImage bounds={openingBounds('front')} source={staticFile('micro-12/cloud-front-flipped.png')}/>))}
    {layer('warning-marker', s.warning.scale > 0 && <g transform={`translate(${s.warning.x} ${s.warning.y}) scale(${s.warning.scale})`}>
      <image href={staticFile('micro-12/warning.svg')} x={-57.1345} y={-53.058} width={114.269} height={106.116}/>
    </g>)}
  </div>;
};
