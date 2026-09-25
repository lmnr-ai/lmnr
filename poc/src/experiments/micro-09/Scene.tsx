import {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {DITHER_DEFAULTS, type DitherState} from '../micro-08/dither';
import {DitherClouds} from './DitherClouds';
import {GRID, TRIANGLES} from './geometry';
import {sampleSparkleGrid, WARNING_ASSETS, type SparkleControls} from './sparkle';

const triangleAssets = [...new Set([...TRIANGLES.values(), ...WARNING_ASSETS])];

export const Micro09Scene = ({progress, time, seed, sparkle, cloudYOffset = 0, cloudTranslateY = 0, cloudTranslateX = [0, 0], signalsYOffset = 0, dither = DITHER_DEFAULTS}: {progress: number; time: number; seed: number; sparkle: SparkleControls; cloudYOffset?: number; cloudTranslateY?: number; cloudTranslateX?: [number, number]; signalsYOffset?: number; dither?: DitherState}) => {
  const [assetHandle] = useState(() => delayRender('Load Micro 09 triangle assets'));
  useEffect(() => {
    let active = true;
    const font = new FontFace('Micro09SignalsMono', `url("${staticFile('micro-09/JetBrainsMono-Regular.woff2')}")`);
    const images = triangleAssets.map(name => new Promise<void>((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Unable to load ${name}`));
      image.src = staticFile(`micro-09/${name}`);
    }));
    Promise.all([...images, font.load().then(loaded => { if (active) document.fonts.add(loaded); })])
      .then(() => { if (active) continueRender(assetHandle); })
      .catch(error => { if (active) cancelRender(error); });
    return () => { active = false; document.fonts.delete(font); };
  }, [assetHandle]);

  const sparkleGrid = sampleSparkleGrid(time, seed, sparkle);
  const cells = Array.from({length: GRID.rows * GRID.columns}, (_, index) => {
    const row = Math.floor(index / GRID.columns);
    const column = index % GRID.columns;
    const cellState = sparkleGrid[index];
    const asset = cellState.kind === 'triangle' ? cellState.asset : null;
    const x = GRID.x + column * GRID.cell;
    const y = GRID.y + row * GRID.cell;
    return <g key={index} transform={`translate(${x} ${y})`} data-kind={cellState.kind}>
      <path d={`M0 0V${GRID.cell}H${GRID.cell}`} fill="none" stroke="#333" strokeWidth="1"/>
      {asset
        ? <image href={staticFile(`micro-09/${asset}`)} x={37.791015625} y={asset === 'group-150.svg' ? 36.82441329956055 : 37.69775390625} width={25.41796875} height={asset === 'group-150.svg' ? 25.351173400878906 : 23.604496002197266}/>
        : <circle cx="50.5" cy="49.5" r="6" fill="#4e4e4e"/>}
    </g>;
  });

  return <div className="micro09-composition">
    <svg className="micro09-grid" viewBox="0 0 1280 720" role="img" aria-label="A field of grid points and sparkling colored warning markers behind two moving clouds" data-progress={progress} data-seed={seed}>
      {cells}
    </svg>
    <div className="micro09-title" style={{transform: `translateY(${signalsYOffset}px)`}} data-node-id="4739:24553">Signals</div>
    <DitherClouds progress={progress} yOffset={cloudYOffset} translateY={cloudTranslateY} translateX={cloudTranslateX} dither={dither}/>
  </div>;
};
