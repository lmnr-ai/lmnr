import {useEffect, useId, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {CELL, FIGMA, GRADIENTS, ROWS, TILE_PERIOD, type streamPhase} from './geometry';

import {DitherBackground} from './DitherBackground';
import {sampleDither, type DitherState} from './dither';
import {BlockContent} from './BlockContent';
import {BLOCK_CONTENT_DEFAULTS, BLOCK_ICONS} from './block-content';
import {INITIAL_OUTRO, LOADER_PATH, OTHER_DOTS, dotFill, gridDotPose, ribbonPatternX, rowPose, type OutroProgress} from './outro';

const BACKGROUND = staticFile('micro-08/image-218.png');
const INITIAL_DITHER = sampleDither(0);

export const Micro08Scene = ({stripPhase, gridPhase, spinnerAngle, dither = INITIAL_DITHER, background = 'dither', showWordsAndIcons = BLOCK_CONTENT_DEFAULTS.showWordsAndIcons, outro = INITIAL_OUTRO}: ReturnType<typeof streamPhase> & {dither?: DitherState; background?: 'reference' | 'dither'; showWordsAndIcons?: boolean; outro?: OutroProgress}) => {
  const id = `micro08-${useId().replace(/:/g, '')}`;
  const ref = (name: string) => `url(#${id}-${name})`;
  const poses = ROWS.map((_, index) => rowPose(index, outro));
  const backgroundOpacity = 1 - outro.backdropFade;
  const fill = dotFill(outro.dotDim);
  const [assetHandle] = useState(() => delayRender('Load Micro 08 Figma assets'));
  // Asset readiness only; animation is a pure function of the supplied phases.
  useEffect(() => {
    let active = true;
    // Preload even with content hidden: toggling never flashes fallback typography.
    const font = new FontFace('Micro08BlockMono', `url("${staticFile('micro-07/JetBrainsMono-Regular.woff2')}")`);
    const images = [...Object.values(BLOCK_ICONS).map(name => staticFile(`micro-08/${name}`)),
      ...(background === 'reference' ? [BACKGROUND] : [])];
    Promise.all([
      font.load().then(loaded => { if (active) document.fonts.add(loaded); }),
      ...images.map(src => new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`Unable to load ${src}`));
        image.src = src;
      })),
    ]).then(() => { if (active) continueRender(assetHandle); }).catch(error => { if (active) cancelRender(error); });
    return () => { active = false; document.fonts.delete(font); };
  }, [assetHandle, background]);

  return <div className="micro08-composition">
    {background === 'dither' && <div className="micro08-cloud" style={{opacity: backgroundOpacity}}><DitherBackground state={dither}/></div>}
    <svg className="micro08-scene" viewBox="0 0 1280 720" role="img" aria-label="Seven streaming agents becoming the first column of a seven-row dot grid"
    data-strip-phase={stripPhase} data-grid-phase={gridPhase} data-spinner-angle={spinnerAngle} data-block-content={showWordsAndIcons}>
    <defs>
      <pattern id={`${id}-grid`} x={FIGMA.grid.originX - gridPhase} y={FIGMA.grid.originY} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
        <path d="M0 0V48H48" fill="none" stroke={FIGMA.grid.stroke} strokeWidth="1"/>
      </pattern>
      {Object.entries(GRADIENTS).map(([kind, colors]) => <linearGradient key={kind} id={`${id}-${kind}`} x1="0" y1="0" x2={kind === 'purple' || kind === 'yellow' ? '0' : '1'} y2={kind === 'purple' || kind === 'yellow' ? '1' : '0'}>
        <stop offset="0" stopColor={colors[0]}/><stop offset="1" stopColor={colors[1]}/>
      </linearGradient>)}
      {ROWS.map((row, index) => <pattern key={index} id={`${id}-row-${index}`} x={ribbonPatternX(poses[index], stripPhase)} y={poses[index].y - poses[index].radius} width={TILE_PERIOD * poses[index].scale} height={CELL * poses[index].scale} patternUnits="userSpaceOnUse" viewBox={`0 0 ${TILE_PERIOD} ${CELL}`}>
        {/* Exact shared edges, rasterized without subpixel background cracks. */}
        <g shapeRendering="crispEdges">{row.blocks.map((block, blockIndex) => <rect key={blockIndex} x={block.x - (row.agent.x - TILE_PERIOD)} width={block.width} height={CELL} fill={ref(block.kind)}/>)}</g>
        {showWordsAndIcons && row.blocks.map((block, blockIndex) => <BlockContent key={blockIndex} block={block} x={block.x - (row.agent.x - TILE_PERIOD)}/>)}
      </pattern>)}
    </defs>
    {background === 'reference' && <image href={BACKGROUND} x={FIGMA.backgroundImage.x} y={FIGMA.backgroundImage.y} width={FIGMA.backgroundImage.width} height={FIGMA.backgroundImage.height} preserveAspectRatio="xMidYMid slice" opacity={backgroundOpacity}/>}
    <rect className="micro08-grid" width="1280" height="720" fill={ref('grid')} opacity={backgroundOpacity}/>
    {poses.map((pose, index) => <rect key={index} className="micro08-strip" x="0" y={pose.y - pose.radius} width={pose.x} height={CELL * pose.scale} fill={ref(`row-${index}`)} opacity={pose.streamOpacity}/>)}
    {OTHER_DOTS.map(dot => {
      const pose = gridDotPose(dot, outro.gridSlide);
      return <circle key={`${dot.column}-${dot.row}`} className="micro08-grid-dot" cx={pose.x} cy={pose.y} r={pose.radius} opacity={pose.opacity} fill={fill}/>;
    })}
    {poses.map((pose, index) => <g key={index} className="micro08-agent" transform={`translate(${pose.x} ${pose.y})`}>
      {/* This same circle survives the entire transition and becomes column0. */}
      <circle className="micro08-head" r={pose.radius} fill={fill}/>
      <g transform={`rotate(${spinnerAngle}) scale(${pose.scale})`}>
        <path className="micro08-loader" d={LOADER_PATH} transform="translate(-19 -19)" fill="none" stroke="black" strokeWidth={pose.loaderStrokeWidth}/>
      </g>
    </g>)}
  </svg></div>;
};
