import {useEffect, useId, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {DITHER_DEFAULTS, type DitherState} from '../micro-08/dither';
import {AGENT, CELL, GRADIENTS, STREAM_PERIOD, STREAM_SEGMENTS} from './geometry';
import {DitherPhoto, DitherPuffs} from './DitherPhoto';

export type Micro10SceneProps = {
  streamPhase: number;
  gridPhase: number;
  loaderAngle: number;
  cloudBounds: {x: number; y: number; width: number; height: number};
  puffs: Array<{bounds: {x: number; y: number; width: number; height: number}; opacity: number; progress: number}>;
  puffBrightness: number;
  dither?: DitherState;
};

export const Micro10Scene = ({streamPhase, gridPhase, loaderAngle, cloudBounds, puffs, puffBrightness, dither = DITHER_DEFAULTS}: Micro10SceneProps) => {
  const id = `micro10-${useId().replace(/:/g, '')}`;
  const ref = (name: string) => `url(#${id}-${name})`;
  const [assetHandle] = useState(() => delayRender('Load Micro 10 assets'));
  useEffect(() => {
    let active = true;
    const font = new FontFace('Micro10Mono', `url("${staticFile('micro-07/JetBrainsMono-Regular.woff2')}")`);
    const sources = ['read.svg', 'tool.svg', 'spinner.svg'].map(name => staticFile(`micro-10/${name}`));
    Promise.all([
      font.load().then(loaded => { if (active) document.fonts.add(loaded); }),
      ...sources.map(src => new Promise<void>((resolve, reject) => {
        const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error(`Unable to load ${src}`)); image.src = src;
      })),
    ]).then(() => { if (active) continueRender(assetHandle); }).catch(error => { if (active) cancelRender(error); });
    return () => { active = false; document.fonts.delete(font); };
  }, [assetHandle]);

  return <div className="micro10-composition">
    <svg className="micro10-grid" viewBox="0 0 1280 720" aria-hidden="true">
      <defs><pattern id={`${id}-grid`} x={AGENT.x - gridPhase} y="-60" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
        <path d={`M0 0V${CELL}H${CELL}`} fill="none" stroke="#333" strokeWidth="1"/>
      </pattern></defs>
      <rect width="1280" height="720" fill={ref('grid')}/>
    </svg>
    <DitherPuffs puffs={puffs.map(({bounds, opacity}) => ({bounds, opacity}))} dither={dither} brightness={puffBrightness}/>
    <DitherPhoto bounds={cloudBounds} dither={dither}/>
    <svg className="micro10-scene" viewBox="0 0 1280 720" role="img" aria-label="A single infinite tool streamer feeding a cloud-topped agent with shrinking smoke puffs">
      <defs>
        {Object.entries(GRADIENTS).map(([name, colors]) => <linearGradient key={name} id={`${id}-${name}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={colors[0]}/><stop offset="1" stopColor={colors[1]}/>
        </linearGradient>)}
        <pattern id={`${id}-stream`} x={AGENT.x - STREAM_PERIOD - streamPhase} y={AGENT.y - CELL / 2} width={STREAM_PERIOD} height={CELL} patternUnits="userSpaceOnUse" viewBox={`0 0 ${STREAM_PERIOD} ${CELL}`}>
          <rect width={STREAM_SEGMENTS[0].width} height={CELL} fill={ref('green')}/>
          <text x={STREAM_SEGMENTS[0].start + 32} y="78" className="micro10-label">Write</text>
          <image href={staticFile('micro-10/read.svg')} x={STREAM_SEGMENTS[1].start} width={STREAM_SEGMENTS[1].width} height="120"/>
          <rect x={STREAM_SEGMENTS[2].start} width={STREAM_SEGMENTS[2].width} height={CELL} fill={ref('blue')}/>
          <text x={STREAM_SEGMENTS[2].start + 32} y="78" className="micro10-label">Thinking...</text>
          <image href={staticFile('micro-10/tool.svg')} x={STREAM_SEGMENTS[3].start} width={STREAM_SEGMENTS[3].width} height="120"/>
          <rect x={STREAM_SEGMENTS[4].start} width={STREAM_SEGMENTS[4].width} height={CELL} fill={ref('pink')}/>
          <text x={STREAM_SEGMENTS[4].start + 32} y="78" className="micro10-label">Bash</text>
          <image href={staticFile('micro-10/tool.svg')} x={STREAM_SEGMENTS[5].start} width={STREAM_SEGMENTS[5].width} height="120"/>
        </pattern>
      </defs>
      <rect x="0" y={AGENT.y - CELL / 2} width={AGENT.x} height={CELL} fill={ref('stream')}/>
      <g transform={`translate(${AGENT.x} ${AGENT.y})`}>
        <circle r={AGENT.radius} fill="#fff"/>
        <image href={staticFile('micro-10/spinner.svg')} x="-45" y="-45" width="90" height="90" transform={`rotate(${loaderAngle})`}/>
      </g>
    </svg>
  </div>;
};
