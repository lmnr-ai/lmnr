import {useId, type CSSProperties} from 'react';
import type {MicroSample} from './timeline';

const TRACKS = {
  lower: 'M-165 555H764.5C886.003 555 984.5 653.497 984.5 775V889',
  left: 'M-466.5 231.5H495C572.32 231.5 635 294.18 635 371.5V933',
  comet: 'M321 -317V280C321 346.274 374.726 400 441 400H1352.5',
  upper: 'M635 -418V-144.5C635 76.4139 814.086 255.5 1035 255.5H1385.5',
};

// The visible rails extend far beyond the canvas so 3D rotation and shear never
// reveal their end caps. Comets retain the original paths so their timing stays unchanged.
const EXTENDED_TRACKS = {
  lower: 'M-2000 555H764.5C886.003 555 984.5 653.497 984.5 775V2000',
  left: 'M-2000 231.5H495C572.32 231.5 635 294.18 635 371.5V2000',
  comet: 'M321 -2000V280C321 346.274 374.726 400 441 400H2500',
  upper: 'M635 -2000V-144.5C635 76.4139 814.086 255.5 1035 255.5H2500',
};
const SEGMENTS = 96;

const mix = (a: [number, number, number], b: [number, number, number], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(' ')})`;

interface TrailProps {
  path: string;
  progress: number;
  tailLength: number;
  intensity: number;
  dashGap: number;
  strokeWidth: number;
  color?: 'orange' | 'white';
}

const TrailStroke = ({path, progress, tailLength, intensity, dashGap, strokeWidth, color = 'orange'}: TrailProps) => {
  const glowId = useId().replaceAll(':', '');
  const stride = tailLength / SEGMENTS;
  const paintedLength = stride / (1 + dashGap);
  const start = progress - tailLength;

  return (
    <g filter={`url(#${glowId})`}>
      <defs>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation={color === 'orange' ? 10 * intensity : 7} result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {Array.from({length: SEGMENTS}, (_, index) => {
        const alongTail = (index + 0.5) / SEGMENTS;
        const position = start + alongTail * tailLength;
        if (position < 0 || position > 1) return null;
        const eased = Math.pow(alongTail, 1.7);
        const opacity = Math.pow(alongTail, 2.2) * intensity;
        const stroke = color === 'white'
          ? '#ffffff'
          : mix([208, 117, 78], [255, 127, 127], Math.pow(eased, 5));
        return (
          <path
            key={index}
            d={path}
            pathLength={1}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap={dashGap > 0.15 ? 'round' : 'butt'}
            strokeDasharray={`${paintedLength} ${1 - paintedLength}`}
            strokeDashoffset={-position}
            opacity={opacity}
          />
        );
      })}
    </g>
  );
};

export const MicroScene = ({
  time,
  comets,
  whiteTrailOpacity = 0.07,
  dashGap = 0,
  strokeWidth = 54,
  maskWidth = 120,
  maskOpacity = 1,
  perspective = 1200,
  rotateX = 0,
  rotateY = 0,
  rotateZ = 0,
  shearX = 0,
  shearY = 0,
  scale = 1,
  renderMode = false,
}: {
  time: number;
  comets: MicroSample;
  whiteTrailOpacity?: number;
  dashGap?: number;
  strokeWidth?: number;
  maskWidth?: number;
  maskOpacity?: number;
  perspective?: number;
  rotateX?: number;
  rotateY?: number;
  rotateZ?: number;
  shearX?: number;
  shearY?: number;
  scale?: number;
  renderMode?: boolean;
}) => (
  <main className={`micro-scene${renderMode ? ' micro-scene-render' : ''}`} style={{perspective: `${perspective}px`}}>
    <div
      className="micro-mask"
      style={{
        '--mask-width': `${maskWidth}px`,
        '--mask-edge-alpha': 1 - maskOpacity,
      } as CSSProperties}
    >
      <svg
        className="micro-art"
        style={{transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg) skew(${shearX}deg, ${shearY}deg) scale(${scale})`}}
        viewBox="0 0 1280 720"
        role="img"
        aria-label="Layered paths with moving path-relative trails"
      >
        <rect width="1280" height="720" fill="#0F0F0F" />

        {/* Painter's order is deliberate: each bridge and comet stay in their own depth layer. */}
        <path d={EXTENDED_TRACKS.lower} stroke="#171717" strokeWidth={strokeWidth} fill="none" />
        <TrailStroke path={TRACKS.lower} {...comets.lowerWhiteComet} intensity={comets.lowerWhiteComet.intensity * whiteTrailOpacity} dashGap={dashGap} strokeWidth={strokeWidth} color="white" />

        <path d={EXTENDED_TRACKS.left} stroke="#212122" strokeWidth={strokeWidth} fill="none" />
        <TrailStroke path={TRACKS.left} {...comets.leftWhiteComet} intensity={comets.leftWhiteComet.intensity * whiteTrailOpacity} dashGap={dashGap} strokeWidth={strokeWidth} color="white" />

        <path d={EXTENDED_TRACKS.comet} stroke="#2D2D2F" strokeWidth={strokeWidth} fill="none" />
        <TrailStroke path={TRACKS.comet} {...comets.orangeComet} dashGap={dashGap} strokeWidth={strokeWidth} />

        <path d={EXTENDED_TRACKS.upper} stroke="#171717" strokeWidth={strokeWidth} fill="none" />
        <TrailStroke path={TRACKS.upper} {...comets.upperWhiteComet} intensity={comets.upperWhiteComet.intensity * whiteTrailOpacity} dashGap={dashGap} strokeWidth={strokeWidth} color="white" />
      </svg>
    </div>
    {!renderMode && (
      <aside className="micro-hud">
        <span>{time.toFixed(3)}s</span>
      </aside>
    )}
  </main>
);
