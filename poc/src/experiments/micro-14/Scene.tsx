import {staticFile} from 'remotion';
import {CELL_COUNT, CLUSTERS, COLORS, GRID, SMALL_WARNING, borderBoxContentCenter, cellCoordinates, inwardBorderRects} from './geometry';
import type {Micro14Sample} from './sample';

const asset = (size: 'small' | 'large', color: string) => staticFile(`micro-14/${size}-${color}.svg`);

export type GroundDot = Readonly<{cell: number; x: number; y: number; scale: number}>;

export const Micro14Scene = (sample: Micro14Sample & {groundDots?: readonly GroundDot[]; clusterBackground?: string}) => <div className="micro14-composition" data-phase={sample.phase} data-authored-frame={sample.authoredFrame}>
  <svg className="micro14-scene" viewBox="0 0 1280 720" role="img" aria-label="Warning signals gather into six issue clusters">
    <rect width="1280" height="720" fill={COLORS.background}/>
    <g aria-label="18 by 12 reference grid">
      {Array.from({length: CELL_COUNT}, (_, index) => {
        const {column, row} = cellCoordinates(index);
        const x = GRID.x + column * GRID.cell;
        const y = GRID.y + row * GRID.cell;
        const borders = inwardBorderRects(x, y, GRID.cell, GRID.cell);
        return <g key={index} fill={COLORS.grid}>
          <rect {...borders.left}/>
          <rect {...borders.bottom}/>
        </g>;
      })}
    </g>
    {sample.groundDots && <g aria-label="stationary ground dots">
      {sample.groundDots.map(dot => <circle key={dot.cell} data-ground-cell={dot.cell} cx={dot.x} cy={dot.y} r="6" fill={COLORS.dot}
        transform={`translate(${dot.x} ${dot.y}) scale(${dot.scale}) translate(${-dot.x} ${-dot.y})`}/>)}
    </g>}
    <g aria-label="stable grid occupants">
      {sample.tokens.map(({token, x, y}) => token.kind === 'dot'
        ? (sample.groundDots ? null : <circle key={token.id} data-token-id={token.id} cx={x} cy={y} r="6" fill={COLORS.dot}/>)
        : <g key={token.id} data-warning-appearance={sample.warningAppearance[token.id]}>
            {!sample.groundDots && <circle data-appearance-dot={token.id} cx={x} cy={y} r="6" fill={COLORS.dot}
              transform={`translate(${x} ${y}) scale(${1 - sample.warningAppearance[token.id]}) translate(${-x} ${-y})`}/>}
            <image data-token-id={token.id} data-cluster-id={token.clusterId ?? 'singleton'}
              href={asset('small', token.color!)} x={x - SMALL_WARNING.width / 2} y={y - SMALL_WARNING.height / 2}
              width={SMALL_WARNING.width} height={SMALL_WARNING.height}
              transform={`translate(${x} ${y}) scale(${sample.warningAppearance[token.id] * (token.clusterId ? sample.clusters[token.clusterId].smallWarningScale : 1)}) translate(${-x} ${-y})`}/>
          </g>) }
    </g>
    <g aria-label="merged issue clusters">
      {CLUSTERS.map(cluster => {
        const {x: centerX, y: centerY} = borderBoxContentCenter(cluster.x, cluster.y, cluster.width, cluster.height);
        const borders = inwardBorderRects(cluster.x, cluster.y, cluster.width, cluster.height);
        const merge = sample.clusters[cluster.id];
        return <g key={cluster.id} data-cluster={cluster.id} data-ready-at={merge.readyAt}>
          <g opacity={merge.clusterBackgroundOpacity}>
            <rect x={cluster.x} y={cluster.y} width={cluster.width} height={cluster.height} fill={sample.clusterBackground ?? COLORS.clusterBackground}/>
            <g fill={COLORS.grid}>
              <rect {...borders.left}/>
              <rect {...borders.bottom}/>
            </g>
          </g>
          <image href={asset('large', cluster.color)} x={centerX - cluster.warningWidth / 2} y={centerY - cluster.warningHeight / 2}
            width={cluster.warningWidth} height={cluster.warningHeight}
            transform={`translate(${centerX} ${centerY}) scale(${merge.largeWarningScale}) translate(${-centerX} ${-centerY})`}/>
        </g>;
      })}
    </g>
  </svg>
</div>;
