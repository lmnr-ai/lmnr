import {Heerich} from 'heerich';
import {useMemo} from 'react';

interface Micro05SceneProps {
  tileCount?: number;
  tileSize?: number;
  gridScale?: number;
  cameraAngle?: number;
  backDarken?: number;
  borderWidth?: number;
  waveProgress?: number;
  waveWidth?: number;
  activationHeight?: number;
  colorFadeTrail?: number;
  activationColor?: string;
  defaultTileColor?: string;
  borderColor?: string;
  clusterProgress?: [number, number, number];
  clusterProbability?: [number, number, number];
  clusterMinimumHeight?: number;
  clusterMaximumHeight?: number;
  clusterColor?: [string, string, string];
  clusterSeed?: [number, number, number];
  clusterSpread?: number;
  shaftLength?: number;
  shaftOpacity?: number;
  seed?: number;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const hash = (x: number, z: number, seed: number) => {
  let value = Math.imul(x + 0x7fffffff, 374761393) ^ Math.imul(z + 0x7fffffff, 668265263) ^ Math.imul(seed, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
};

export const Micro05Scene = ({
  tileCount = 31,
  tileSize = 74,
  gridScale = 160,
  cameraAngle = 45,
  backDarken = 50,
  borderWidth = 2,
  waveProgress = 0,
  waveWidth = 3.5,
  activationHeight = 1.5,
  colorFadeTrail = 8,
  activationColor = '#da875f',
  defaultTileColor = '#2e2e2e',
  borderColor = '#171717',
  clusterProgress = [0, 0, 0],
  clusterProbability = [0.22, 0.18, 0.14],
  clusterMinimumHeight = 0.5,
  clusterMaximumHeight = 3,
  clusterColor = ['#7c6ee6', '#61b8a8', '#da875f'],
  clusterSeed = [101, 202, 303],
  clusterSpread = 7,
  shaftLength = 30,
  shaftOpacity = 0.32,
  seed = 404,
}: Micro05SceneProps) => {
  const svg = useMemo(() => {
    const camera = {type: 'isometric' as const, angle: cameraAngle};
    const h = new Heerich({tile: tileSize, camera});
    const shafts = new Heerich({tile: tileSize, camera});
    const framing = new Heerich({tile: tileSize, camera});
    const half = Math.floor(tileCount / 2);
    for (const x of [-half, half]) {
      for (const z of [-half, half]) {
        framing.addGeometry({type: 'box', position: [x, 0, z], size: 1, scale: [1, 1, 1], gap: 0});
      }
    }
    const frameBounds = framing.getBounds(tileSize);
    const waveStart = half + waveWidth * 2;
    // Continue far enough beyond the grid for even the extended color tail to clear.
    const waveEnd = -half - waveWidth * 2 - colorFadeTrail * 4;
    const waveCenter = waveStart + (waveEnd - waveStart) * waveProgress;
    const shaftGradients: string[] = [];

    for (let x = -half; x <= half; x++) {
      for (let z = -half; z <= half; z++) {
        const depth = (x + z + half * 2) / Math.max(1, half * 4);
        const darken = Math.max(0, Math.min(backDarken * depth, 100));
        const maximum = Math.exp(-0.5 * Math.pow((z - waveCenter) / Math.max(0.01, waveWidth), 2));
        const randomActivation = hash(x, z, seed);
        const activation = smoothstep(maximum * randomActivation);
        const trailingDistance = z - waveCenter;
        const colorEnvelope = trailingDistance <= 0
          ? maximum
          : Math.exp(-0.5 * Math.pow(trailingDistance / Math.max(0.01, colorFadeTrail), 2));
        const colorActivation = smoothstep(Math.max(maximum, colorEnvelope) * randomActivation);
        const centerWeight = Math.exp(-0.5 * ((x * x + z * z) / Math.max(0.01, clusterSpread * clusterSpread)));
        let clusterIndex = -1;
        for (let index = 0; index < 3; index++) {
          if (hash(x, z, clusterSeed[index]) < clusterProbability[index] * centerWeight) {
            clusterIndex = index;
            break;
          }
        }
        const clusterPhase = clusterIndex < 0 ? 0 : Math.sin(Math.PI * clamp(clusterProgress[clusterIndex]));
        const clusterActivation = smoothstep(clusterPhase);
        const clusterHeightRandom = clusterIndex < 0 ? 0 : hash(x, z, clusterSeed[clusterIndex] + 7919);
        const heightFloor = Math.min(clusterMinimumHeight, clusterMaximumHeight);
        const heightCeiling = Math.max(clusterMinimumHeight, clusterMaximumHeight);
        const selectedClusterHeight = clusterIndex < 0
          ? 0
          : heightFloor + (heightCeiling - heightFloor) * centerWeight * clusterHeightRandom;
        const combinedHeight = activation * activationHeight + clusterActivation * selectedClusterHeight;
        const base = `color-mix(in oklch, ${defaultTileColor}, black ${darken}%)`;
        const waveColor = `color-mix(in oklch, ${base}, ${activationColor} ${colorActivation * 100}%)`;
        const active = clusterIndex < 0
          ? waveColor
          : `color-mix(in oklch, ${waveColor}, ${clusterColor[clusterIndex]} ${clusterActivation * 100}%)`;
        const waveBorder = `color-mix(in oklch, ${borderColor}, ${activationColor} ${colorActivation * 100}%)`;
        const activeBorder = clusterIndex < 0
          ? waveBorder
          : `color-mix(in oklch, ${waveBorder}, ${clusterColor[clusterIndex]} ${clusterActivation * 100}%)`;
        const shaftId = `shaft-${x + half}-${z + half}`;
        const shaftTop = h.project([x + 0.5, 1 - combinedHeight, z + 0.5]);
        const shaftBottom = h.project([x + 0.5, 1 - combinedHeight + shaftLength, z + 0.5]);
        shaftGradients.push(
          `<linearGradient id="${shaftId}" gradientUnits="userSpaceOnUse" x1="${shaftTop.x}" y1="${shaftTop.y}" x2="${shaftBottom.x}" y2="${shaftBottom.y}"><stop offset="0" stop-color="${active}" stop-opacity="${shaftOpacity}"/><stop offset="1" stop-color="${active}" stop-opacity="0"/></linearGradient>`,
        );

        shafts.addGeometry({
          type: 'box',
          position: [x, 1 - combinedHeight, z],
          size: 1,
          scale: [1, shaftLength, 1],
          scaleOrigin: [0.5, 0, 0.5],
          gap: 0,
          style: {
            default: {fill: `url(#${shaftId})`, stroke: 'none', strokeWidth: 0, opacity: 1},
            top: {fill: active, opacity: shaftOpacity},
            left: {fill: `url(#${shaftId})`},
            front: {fill: `url(#${shaftId})`},
          },
        });

        h.addGeometry({
          type: 'box',
          position: [x, -combinedHeight, z],
          size: 1,
          scale: [1, 1, 1],
          scaleOrigin: [0.5, 0, 0.5],
          gap: 0,
          style: {
            default: {
              fill: active,
              stroke: activeBorder,
              strokeWidth: borderWidth,
              opacity: 1,
            },
            top: {fill: active},
            left: {fill: `color-mix(in oklch, ${active}, black 24%)`},
            front: {fill: `color-mix(in oklch, ${active}, black 12%)`},
          },
        });
      }
    }

    const viewBox: [number, number, number, number] = [frameBounds.x, frameBounds.y, frameBounds.w, frameBounds.h];
    return {
      // Shafts render in their own pass behind every cube. Long transparent prisms
      // otherwise confuse per-face depth sorting when mixed with the cube field.
      shaftSvg: shafts.toSVG({viewBox, prepend: `<defs>${shaftGradients.join('')}</defs>`}),
      cubeSvg: h.toSVG({viewBox}),
    };
  }, [activationColor, activationHeight, backDarken, borderColor, borderWidth, cameraAngle, clusterColor, clusterMaximumHeight, clusterMinimumHeight, clusterProbability, clusterProgress, clusterSeed, clusterSpread, colorFadeTrail, defaultTileColor, seed, shaftLength, shaftOpacity, tileCount, tileSize, waveProgress, waveWidth]);

  return (
    <div className="micro05-scene">
      <div
        className="micro05-grid"
        style={{transform: `scale(${gridScale / 100})`}}
      >
        <div className="micro05-shaft-layer" dangerouslySetInnerHTML={{__html: svg.shaftSvg}} />
        <div className="micro05-cube-layer" dangerouslySetInnerHTML={{__html: svg.cubeSvg}} />
      </div>
    </div>
  );
};
