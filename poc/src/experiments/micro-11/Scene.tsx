import {useEffect, useId, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {BIG_GRID, CELL, GRADIENTS, STREAM_PERIOD, type sampleMicro11} from './geometry';

export type Micro11SceneProps = ReturnType<typeof sampleMicro11>;

export const Micro11Scene = ({cells, streamPhase, gridPhase, loaderAngle, camera, contentScale, agentRadius, smallGridOpacity, streamHeightScale, loaderOpacity, dotColor}: Micro11SceneProps) => {
  const id = `micro11-${useId().replace(/:/g, '')}`;
  const ref = (name: string) => `url(#${id}-${name})`;
  const [assetHandle] = useState(() => delayRender('Load Micro 11 assets'));
  useEffect(() => {
    let active = true;
    const font = new FontFace('Micro11Mono', `url("${staticFile('micro-07/JetBrainsMono-Regular.woff2')}")`);
    const sources = ['read.svg', 'tool.svg', 'spinner.svg'].map(name => staticFile(`micro-11/${name}`));
    Promise.all([
      font.load().then(loaded => { if (active) document.fonts.add(loaded); }),
      ...sources.map(src => new Promise<void>((resolve, reject) => {
        const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error(`Unable to load ${src}`)); image.src = src;
      })),
    ]).then(() => { if (active) continueRender(assetHandle); }).catch(error => { if (active) cancelRender(error); });
    return () => { active = false; document.fonts.delete(font); };
  }, [assetHandle]);

  return <div className="micro11-composition">
    <svg className="micro11-scene" viewBox="0 0 1280 720" role="img" aria-label="A live streamer zooms out into a grid of agents as all streams collapse together">
      <defs>
        <pattern id={`${id}-grid`} x={-gridPhase} y="-60" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
          <path d={`M0 0V${CELL}H${CELL}`} fill="none" stroke="#333" strokeWidth="1"/>
        </pattern>
        {Object.entries(GRADIENTS).map(([name, colors]) => <linearGradient key={name} id={`${id}-${name}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={colors[0]}/><stop offset="1" stopColor={colors[1]}/>
        </linearGradient>)}
        <pattern id={`${id}-stream`} x={-STREAM_PERIOD - streamPhase} y={-CELL / 2} width={STREAM_PERIOD} height={CELL} patternUnits="userSpaceOnUse" viewBox={`0 0 ${STREAM_PERIOD} ${CELL}`}>
          <rect width="240" height={CELL} fill={ref('green')}/>
          <text x="32" y="78" className="micro11-label">Write</text>
          <image href={staticFile('micro-11/read.svg')} x="240" width="120" height="120"/>
          <rect x="360" width="360" height={CELL} fill={ref('blue')}/>
          <text x="392" y="78" className="micro11-label">Thinking...</text>
          <image href={staticFile('micro-11/tool.svg')} x="720" width="120" height="120"/>
          <rect x="840" width="240" height={CELL} fill={ref('pink')}/>
          <text x="872" y="78" className="micro11-label">Bash</text>
          <image href={staticFile('micro-11/tool.svg')} x="1080" width="120" height="120"/>
        </pattern>
        {cells.map(cell => <g key={cell.id}>
          <pattern id={`${id}-stream-${cell.id}`} href={`#${id}-stream`} x={-STREAM_PERIOD - cell.streamPhase}/>
          <pattern id={`${id}-grid-${cell.id}`} href={`#${id}-grid`} x={-cell.gridPhase}/>
        </g>)}
      </defs>
      <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
        {/* Boundaries are always present in world space; the camera reveals them. */}
        {cells.map(cell => <g key={cell.id} transform={`translate(${cell.x} ${cell.y})`}>
          <rect x={-BIG_GRID.pitch / 2} y={-BIG_GRID.pitch / 2} width={BIG_GRID.pitch} height={BIG_GRID.pitch}
            fill="none" stroke="#333" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
          {smallGridOpacity > 0 && <g transform={`scale(${contentScale})`}>
            <rect x={-BIG_GRID.pitch / (2 * contentScale)} y={-BIG_GRID.pitch / (2 * contentScale)}
              width={BIG_GRID.pitch / contentScale} height={BIG_GRID.pitch / contentScale} fill={ref(`grid-${cell.id}`)} opacity={smallGridOpacity}/>
          </g>}
          {/* Share the agent's scale; only the collapse clip changes their height ratio. */}
          {streamHeightScale > 0 && <g transform={`scale(${contentScale} ${contentScale * streamHeightScale})`}>
            <rect x={-BIG_GRID.pitch / (2 * contentScale)} y={-CELL / 2} width={BIG_GRID.pitch / (2 * contentScale)} height={CELL} fill={ref(`stream-${cell.id}`)}/>
          </g>}
          <circle r={agentRadius} fill={dotColor}/>
          {loaderOpacity > 0 && <image href={staticFile('micro-11/spinner.svg')}
            x={-agentRadius * .75} y={-agentRadius * .75} width={agentRadius * 1.5} height={agentRadius * 1.5}
            opacity={loaderOpacity} transform={`rotate(${loaderAngle})`}/>}
        </g>)}
      </g>
    </svg>
  </div>;
};
