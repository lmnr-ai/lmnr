import {useEffect, useId, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {BLOCKS, CELL, LENGTH, PATH, REVEAL_BOUNDS, blockOutline, pose} from './geometry';
import {OVERVIEW} from './overview';

import {blockPaint, gradientEndpoints, SCENE_PALETTES, type SnailPalette} from './palette';

export type Micro06SceneProps = {
  palette?: SnailPalette;
  travelProgress?: number;
  agentScale?: number;
  worldOpacity?: number; spinnerScale?: number; whiteMix?: number;
  time?: number; spinnerSpeed?: number;
};

export const Micro06Scene = ({travelProgress=0, agentScale=1, time=0, spinnerSpeed=1.9, palette='vibrant', worldOpacity=1, spinnerScale=1, whiteMix=0}: Micro06SceneProps) => {
  const [fontHandle] = useState(() => delayRender('Load Snail typography'));
  useEffect(() => {
    const font = new FontFace('SnailMono', `url("${staticFile('micro-06/JetBrainsMono-Regular.woff2')}")`);
    let active = true;
    font.load().then(loaded => {
      if (active) document.fonts.add(loaded);
      continueRender(fontHandle);
    }).catch(error => { if (active) cancelRender(error); });
    return () => { active = false; document.fonts.delete(font); };
  }, [fontHandle]);
  const id = `snail-${useId().replace(/:/g,'')}`;
  const colors = SCENE_PALETTES[palette];
  const state = pose(travelProgress);
  const {agent,camera,distance} = state;
  const ref = (name:string) => `url(#${id}-${name})`;
  // Normalize the cleaned seam to one background and one unfiltered circle.
  // Invisible filtered descendants otherwise alter Chromium's edge rasterization.
  if(worldOpacity===0&&spinnerScale===0&&whiteMix===1)return <svg className="micro06-scene" viewBox="0 0 1280 720" data-scene="snail" aria-label="Snail agent ready for overview">
    <rect width="1280" height="720" fill={OVERVIEW.tile}/>
    <g transform={`translate(640 360) scale(${agentScale})`}><circle r="60" fill="white"/></g>
  </svg>;
  return <svg className="micro06-scene" style={{background:colors.background}} viewBox="0 0 1280 720" data-scene="snail" data-world-opacity={worldOpacity} data-spinner-scale={spinnerScale} data-white-mix={whiteMix} data-distance={distance} data-camera-x={camera.x} data-camera-y={camera.y} aria-label="Snail agent leaving a trace">
    <defs>
      <pattern id={`${id}-grid`} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
        <path d="M0 0 V120 H120" fill="none" stroke={colors.grid} strokeWidth="1" />
      </pattern>
      {BLOCKS.map(b=>{
        const paint=blockPaint(b,palette);
        if(!paint.colors)return null;
        const endpoints=paint.angle!==undefined?gradientEndpoints(paint.angle,b.w,b.h):{x1:0,y1:b.reverse?1:0,x2:b.vertical?0:1,y2:b.vertical?(b.reverse?0:1):0};
        return <linearGradient key={b.id} id={`${id}-${b.id}`} {...endpoints}>
          {paint.colors.map((color,index)=><stop key={index} offset={paint.stops?.[index]??index/(paint.colors!.length-1)} stopColor={color}/>)}
        </linearGradient>;
      })}
      <linearGradient id={`${id}-metal-loader`} {...gradientEndpoints(142.825745764)}>
        <stop offset="5.5707%" stopColor="hsl(2.7119 74.6835% 48.5294%)"/>
        <stop offset="95.148%" stopColor="hsl(337.5 7.2727% 38.1373%)"/>
      </linearGradient>
      <clipPath id={`${id}-agent-outline`}><circle r="60"/></clipPath>
      <filter id={`${id}-metal-noise`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="4" stitchTiles="stitch"/>
      </filter>
      {BLOCKS.filter(b=>b.asset).map(b=><clipPath key={b.id} id={`${id}-outline-${b.id}`}>
        <path d={blockOutline(b)} transform={`translate(${b.x} ${b.y})`}/>
      </clipPath>)}
      {/* REVIEW: rounded leading cap follows the circular agent; completed corners
          remain square. Future self-crossing routes need per-segment masks. */}
      <mask id={`${id}-reveal`} maskUnits="userSpaceOnUse" {...REVEAL_BOUNDS}>
        {distance>0 && <path d={PATH} fill="none" stroke="white" strokeWidth={CELL} strokeLinejoin="miter" strokeLinecap="round" strokeDasharray={`${distance} ${LENGTH+CELL}`} />} 
      </mask>
    </defs>
    <rect width="1280" height="720" fill={colors.background}/>
    <rect width="1280" height="720" fill={OVERVIEW.tile} opacity={whiteMix}/>
    <g className="micro06-world" opacity={worldOpacity} transform={`translate(${camera.x} ${camera.y})`}>
      {/* Viewport-sized repeating pattern: no finite grid edges, regardless of camera. */}
      <rect x={-camera.x-1} y={-camera.y-1} width="1282" height="722" fill={ref('grid')}/>
      <g mask={ref('reveal')} className="micro06-track">
        {BLOCKS.map(b=><g key={b.id} data-block={b.id}>
          {b.asset ? <g clipPath={ref(`outline-${b.id}`)}>
            {palette==='metal'?<>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={ref(b.id)}/>
              <image href={staticFile(blockPaint(b,palette).symbol!)} x={b.x} y={b.y} width={b.w} height={b.h}/>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} filter={ref('metal-noise')} opacity={0.12} style={{mixBlendMode:'soft-light'}}/>
            </>:<image href={staticFile(`micro-06/${b.asset.replace('.svg','-square.svg')}`)} x={b.x} y={b.y} width={b.w} height={b.h}/>}
          </g> : <>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={ref(b.id)}/>
            <foreignObject x={b.x} y={b.y} width={b.w} height={b.h}>
              <div className={`micro06-label${b.vertical?' micro06-label-vertical':''}`} style={{color:palette==='metal'?'#f4f8f8':undefined,paddingLeft:b.textX??32,...(b.vertical?{width:b.h,transform:b.reverse?`translateY(${b.h}px) rotate(-90deg)`:'translateX(120px) rotate(90deg)'}:{})}}>{b.label}</div>
            </foreignObject>
          </>}
        </g>)}
      </g>
    </g>
    <g className="micro06-agent" transform={`translate(${agent.x} ${agent.y}) scale(${agentScale})`} data-x={agent.x} data-y={agent.y}>
      {whiteMix<1&&<circle r="60" fill={palette==='metal'?ref('metal-loader'):'white'}/>}
      {whiteMix>0&&<circle r="60" fill="white" opacity={whiteMix<1?whiteMix:undefined}/>}
      {spinnerScale>0&&<g transform={`scale(${spinnerScale})`}>
        <image href={staticFile(palette==='metal'?'micro-04/thinking-icon.svg':'micro-06/spinner.svg')} x={palette==='metal'?-40:-44.5} y={palette==='metal'?-40:-44.5} width={palette==='metal'?80:89} height={palette==='metal'?80:89} transform={`rotate(${time*360*spinnerSpeed})`}/>
      </g>}
      {palette==='metal'&&whiteMix<1&&<g clipPath={ref('agent-outline')}>
        <rect x="-60" y="-60" width="120" height="120" filter={ref('metal-noise')} opacity={0.12*(1-whiteMix)} style={{mixBlendMode:'soft-light'}}/>
      </g>}
    </g>
  </svg>;
};
