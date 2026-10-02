import type {CSSProperties} from 'react';
import {interpolate} from 'flubber';
import {staticFile} from 'remotion';
import type {Micro04Values} from './timeline';

interface Micro04SceneProps {
  values?: Micro04Values;
  time?: number;
  noiseOpacity?: number;
  noiseFrequency?: number;
  lightnessOffset?: number;
  ellipsisInterval?: number;
  finalFrameSize?: number;
  logoScaleDestination?: number;
  logoBlurPeak?: number;
}

const COMPLETE: Micro04Values = {
  crosses: 1,
  lines: 1,
  loaderReveal: 1,
  loaderSpin: 0,
  thinkingWidth: 1,
  rowTwo: 1,
  rowTwoSlide: 1,
  rowThree: 1,
  endCircleScale: 1,
  timer: 1,
  blocksOutro: 0,
  gridDissolve: 0,
  shapeMorph: 0,
  logoBlurEnter: 0,
  logoBlurExit: 0,
  frameConverge: 0,
};
const THINKING_ICON = staticFile('micro-04/thinking-icon.svg');
const MIDDLE_ICON = staticFile('micro-04/middle-symbol.svg');
const TIME_ICON = staticFile('micro-04/time-symbol.svg');
const CROSS = staticFile('micro-04/cross.svg');
const SOURCE_D = 'M0 0H226C259.137 0 286 26.8629 286 60C286 93.1371 259.137 120 226 120H0Z';
const TARGET_D = 'M58.4879 0.0038335L58.4917 0.0076665C58.7156 0.00514863 58.94 0.0000040221 59.1645 0C92.2107 0 119 26.8629 119 60C119 93.1371 92.2107 120 59.1645 120C58.9402 120 58.7161 119.993 58.4925 119.991L58.4879 119.995L58.4833 120H11.2493C7.63315 120 4.37442 118.471 2.07804 116.024C0.00015558 113.809 0.123993 110.498 1.0264 107.595C5.62208 92.8113 8.10003 77.0907 8.10003 60.7895C8.10003 44.0377 5.48622 27.898 0.643938 12.7589C-0.203505 10.1094 -0.419218 7.12173 1.27611 4.91902C3.5787 1.92733 7.18868 0.000083332 11.2493 0H58.484L58.4879 0.0038335Z';
const morphPath = interpolate(SOURCE_D, TARGET_D, {maxSegmentLength: 3});
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const clampLightness = (value: number) => Math.max(0, Math.min(100, value));
const hsl = (hue: number, saturation: number, lightness: number, offset: number) =>
  `hsl(${hue} ${saturation}% ${clampLightness(lightness + offset)}%)`;
const lerp = (from: number, to: number, progress: number) => from + (to - from) * clamp(progress);

const CornerRig = ({corner, crosses, lines}: {
  corner: 'tl' | 'tr' | 'bl' | 'br';
  crosses: number;
  lines: number;
}) => (
  <div className={`micro04-corner micro04-corner-${corner}`}>
    <i className="micro04-ray micro04-ray-h" style={{transform: `scaleX(${lines})`}} />
    <i className="micro04-ray micro04-ray-v" style={{transform: `scaleY(${lines})`}} />
    <img className="micro04-cross" src={CROSS} style={{opacity: crosses}} />
  </div>
);

export const Micro04Scene = ({
  values = COMPLETE,
  time = 6,
  noiseOpacity = 0.12,
  noiseFrequency = 0.8,
  lightnessOffset = 0,
  ellipsisInterval = 0.15,
  finalFrameSize = 148,
  logoScaleDestination = 48,
  logoBlurPeak = 28,
}: Micro04SceneProps) => {
  const crosses = clamp(values.crosses);
  const lines = clamp(values.lines);
  const loaderReveal = clamp(values.loaderReveal);
  const thinkingWidth = clamp(values.thinkingWidth);
  const rowTwo = clamp(values.rowTwo);
  const rowTwoSlide = clamp(values.rowTwoSlide);
  const rowThree = clamp(values.rowThree);
  const endCircleScale = clamp(values.endCircleScale);
  const blocksOutro = clamp(values.blocksOutro);
  const gridDissolve = clamp(values.gridDissolve);
  const shapeMorph = clamp(values.shapeMorph);
  const logoBlurEnter = clamp(values.logoBlurEnter);
  const logoBlurExit = clamp(values.logoBlurExit);
  const frameConverge = clamp(values.frameConverge);
  const morphWidth = lerp(286, 119, shapeMorph);
  const logoScale = lerp(1, logoScaleDestination / 100, shapeMorph);
  const morphColorMix = `${shapeMorph * 100}%`;
  const logoBlur = logoBlurPeak * logoBlurEnter * (1 - logoBlurExit);
  const outroX = blocksOutro * 526 / 12.8;
  const outroY = blocksOutro * 360 / 7.2;
  const expandedShellWidth = lerp(0, 120, loaderReveal) + lerp(0, 406, thinkingWidth);
  const expandedShellHeight = lerp(0, 120, loaderReveal) + lerp(0, 120, rowTwo) + lerp(0, 120, rowThree);
  const shellWidth = lerp(expandedShellWidth, finalFrameSize, frameConverge);
  const shellHeight = lerp(expandedShellHeight, finalFrameSize, frameConverge);
  // CSS centers the changing SVG inside its fixed 286×120 block. Moving the
  // block's fixed center (263, 180) to the shell center keeps the whole morph centered.
  const contentOffsetX = lerp(0, finalFrameSize / 2 - 263, frameConverge);
  const contentOffsetY = lerp(0, finalFrameSize / 2 - 180, frameConverge);
  const colorStyle = {
    '--m04-thinking-from': hsl(180, 13.7615, 21.3725, lightnessOffset),
    '--m04-thinking-to': hsl(180, 13.0435, 18.0392, lightnessOffset),
    '--m04-loader-from': hsl(2.7119, 74.6835, 53.5294, lightnessOffset),
    '--m04-loader-to': hsl(337.5, 7.2727, 43.1373, lightnessOffset),
    '--m04-row-two-outer': hsl(180, 13.9241, 15.4902, lightnessOffset),
    '--m04-row-two-orb-block': hsl(180, 13.9785, 18.2353, lightnessOffset),
    '--m04-row-two': hsl(180, 11.811, 24.902, lightnessOffset),
    '--m04-orb-from': hsl(183.3333, 30.3371, 65.098, lightnessOffset),
    '--m04-orb-mid': hsl(158.5714, 5.9829, 54.1176, lightnessOffset),
    '--m04-orb-to': hsl(21.0811, 14.8594, 48.8235, lightnessOffset),
    '--m04-grid-from': hsl(160, 8.4112, 41.9608, lightnessOffset),
    '--m04-grid-to': hsl(3.4615, 26.8041, 61.9608, lightnessOffset),
    '--m04-middle-icon-from': hsl(241.2245, 21.3974, 55.098, lightnessOffset),
    '--m04-dark-teal': hsl(180, 14, 19.6078, lightnessOffset),
    '--m04-row-three': hsl(180, 12.766, 18.4314, lightnessOffset),
    '--m04-time-from': hsl(21.4286, 10.2941, 26.6667, lightnessOffset),
    '--m04-time-icon-from': hsl(44.6809, 19.6653, 53.1373, lightnessOffset),
    '--m04-end-orb-from': hsl(354.3038, 69.2982, 55.2941, lightnessOffset),
    '--m04-end-orb-to': hsl(0, 11.8644, 23.1373, lightnessOffset),
  } as CSSProperties;
  const timerStart = 4.76;
  const timerValue = values.timer > 0 ? Math.max(0, time - timerStart) * 4 : 0;
  const ellipsisCycle = [0, 1, 2, 3, 2, 1];
  const ellipsisIndex = Math.floor(time / Math.max(0.01, ellipsisInterval)) % ellipsisCycle.length;
  const thinkingLabel = `Thinking${'.'.repeat(ellipsisCycle[ellipsisIndex])}`;

  return (
    <div className="micro04-scene" style={colorStyle}>
      <section
        className="micro04-shell"
        style={{
          width: `${shellWidth / 12.8}cqw`,
          height: `${shellHeight / 7.2}cqh`,
        }}
      >
        <div className="micro04-clip-viewport">
          <div
            className="micro04-content"
            style={{transform: `translate(${contentOffsetX / 12.8}cqw, ${contentOffsetY / 7.2}cqh)`}}
          >
          <div className="micro04-row micro04-row-thinking">
            <div
              className="micro04-thinking-icon micro04-outro-block"
              style={{transform: `translateY(${-outroY}cqh)`}}
            >
              <img src={THINKING_ICON} style={{transform: `rotate(${values.loaderSpin * 360}deg)`}} />
            </div>
            <div
              className="micro04-thinking-label micro04-outro-block"
              style={{transform: `translateX(${outroX}cqw)`}}
            >{thinkingLabel}</div>
          </div>

          <div className="micro04-row micro04-row-grid">
            <div
              className="micro04-row-two-block micro04-row-two-orb-block"
              style={{transform: `translate(${(1 - rowTwoSlide) * -320 / 12.8}cqw, ${-outroY}cqh)`}}
            >
              <div className="micro04-orb" />
            </div>
            <div
              className="micro04-row-two-block micro04-grid-tail-block micro04-grid-tail"
              style={{transform: `translateX(${(1 - rowTwoSlide) * -320 / 12.8}cqw) scale(${logoScale})`}}
            >
              <svg
                className="micro04-grid-tail-shape"
                style={{
                  width: `${morphWidth / 12.8}cqw`,
                  filter: `blur(${logoBlur}px)`,
                }}
                viewBox={`0 0 ${morphWidth} 120`}
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="micro04-grid-morph-gradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="5.0203%" stopColor={`color-mix(in srgb, var(--m04-grid-from), #f4f8f8 ${morphColorMix})`} />
                    <stop offset="93.876%" stopColor={`color-mix(in srgb, var(--m04-grid-to), #f4f8f8 ${morphColorMix})`} />
                  </linearGradient>
                </defs>
                <path d={morphPath(shapeMorph)} fill="url(#micro04-grid-morph-gradient)" />
              </svg>
              <div className="micro04-dot-grid">
                {Array.from({length: 9}, (_, index) => {
                  const stagger = index / 8 * 0.45;
                  const scale = 1 - clamp((gridDissolve - stagger) / 0.55);
                  return <i key={index} style={{transform: `scale(${scale})`}} />;
                })}
              </div>
            </div>
            <span
              className="micro04-row-two-block micro04-module-icon micro04-middle-icon micro04-outro-block"
              style={{transform: `translateY(${outroY}cqh)`}}
            >
              <img src={MIDDLE_ICON} />
            </span>
          </div>

          <div className="micro04-row micro04-row-time">
            <div
              className="micro04-time-label micro04-outro-block"
              style={{transform: `translateX(${-outroX}cqw)`}}
            >{timerValue.toFixed(1)}s</div>
            <span
              className="micro04-module-icon micro04-time-icon micro04-outro-block"
              style={{transform: `translateX(${-outroX}cqw)`}}
            >
              <img src={TIME_ICON} />
            </span>
            <div
              className="micro04-time-orb-wrap"
              style={{transform: `translateY(${outroY}cqh) scale(${endCircleScale})`}}
            >
              <div className="micro04-time-orb" />
            </div>
          </div>
          </div>
        </div>

        <svg className="micro04-noise" aria-hidden="true">
          <filter id="micro04-noise-filter">
            <feTurbulence type="fractalNoise" baseFrequency={noiseFrequency} numOctaves="3" seed="4" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#micro04-noise-filter)" opacity={noiseOpacity} />
        </svg>
        <CornerRig corner="tl" crosses={crosses} lines={lines} />
        <CornerRig corner="tr" crosses={crosses} lines={lines} />
        <CornerRig corner="bl" crosses={crosses} lines={lines} />
        <CornerRig corner="br" crosses={crosses} lines={lines} />
      </section>
    </div>
  );
};
