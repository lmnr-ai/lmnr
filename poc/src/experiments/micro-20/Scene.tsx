import {OUTRO_TEXT} from './outro';
import {WARNING_ASSETS} from '../micro-09/sparkle';
import {useEffect, useId, useState, type CSSProperties, type ReactNode} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {COLORS, SMALL_WARNING, TOKEN_BY_ID} from '../micro-14/geometry';
import {Micro15Scene} from '../micro-15/Scene';
import {ASSETS, BASH, GRID as LOCAL_GRID} from '../micro-16/geometry';
import {GRID as MACRO_GRID} from '../micro-17/geometry';
import {HIGHLIGHT_LINES, PAPER_LINES, PAPER_LINE_HEIGHT} from './paper';
import {unit} from './timeline';
import type {Micro20Sample} from './sample';
import {isGridCell} from './geometry';
import {WorldGrid} from './WorldGrid';
import {Subtitles} from './Subtitles';

const BLUE_LOADER = 'introducing-flow-1/assets/c2c86b15f174d7c343dc01fc0325a94a36768e05.svg';
const warningAsset = (id: string) => staticFile(`micro-14/small-${TOKEN_BY_ID.get(id)?.color}.svg`);
const ToolBlock = ({x, y, width, label, source}: {x: number; y: number; width: number; label?: string; source?: string}) => source
  ? <image href={staticFile(`micro-16/${source}`)} x={x} y={y} width={width} height={120}/>
  : <g><rect x={x} y={y} width={width} height={120} fill="#5c5c5c"/><text className="micro20-label" x={x + 32} y={y + 78}>{label}</text></g>;

export const Micro20Scene = ({sample: s, sharedEntry = false, showSubtitles = true, traceContent, report, extendedGrid = false}: {sample: Micro20Sample; sharedEntry?: boolean; showSubtitles?: boolean; traceContent?: {lines: readonly string[]; highlights: readonly number[]}; report?: ReactNode; extendedGrid?: boolean}) => {
  const id = `micro20-${useId().replace(/:/g, '')}`;
  const [handle] = useState(() => delayRender('Load Animation 20 typography and assets'));
  useEffect(() => {
    const font = new FontFace('Micro20Mono', `url("${staticFile('micro-07/JetBrainsMono-Regular.woff2')}")`);
    const images = [staticFile(BLUE_LOADER), staticFile(`micro-16/${ASSETS.warning}`), staticFile(`micro-16/${ASSETS.bashConnector}`), staticFile(`micro-16/${ASSETS.bashTool}`),
      ...WARNING_ASSETS.map(asset => staticFile(`micro-09/${asset}`)),
      ...['purple', 'yellow', 'blue', 'salmon', 'green', 'pink'].map(color => staticFile(`micro-14/small-${color}.svg`))];
    Promise.all([font.load().then(loaded => document.fonts.add(loaded)), ...images.map(src => new Promise<void>((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error(`Missing ${src}`)); image.src = src;
    }))]).then(() => continueRender(handle)).catch(cancelRender);
  }, [handle]);
  if (s.phase === 'issues') {
    const scale = s.outro?.scale ?? 1;
    const issue = s.outro?.issue ?? s.issue;
    // Keep the exact source raster pipeline at scale 1: even an offscreen SVG
    // or identity CSS transform can change Chromium's warning-edge antialiasing.
    return <div className={`micro20-composition micro20-issues${s.outro && scale < 1 ? ' micro20-outro' : ''}`} data-phase={s.outro ? 'outro' : 'issues'} data-time={s.time} data-outro-scale={scale}
      style={{'--micro20-world-x': `${s.issueWorld.translation.x}px`, '--micro20-world-y': `${s.issueWorld.translation.y}px`} as CSSProperties}>
      <svg className="micro20-world" viewBox="0 0 1280 720" aria-label="Persistent centered issue grid">
        <g transform={`translate(640 360) scale(${78 / MACRO_GRID.pitch * scale})`}><WorldGrid cameraScale={78 / MACRO_GRID.pitch * scale} extended={!!s.outro && scale < 1}/></g>
      </svg>
      <div className="micro20-issue-occupants" style={{transform: scale === 1 ? undefined : `scale(${scale})`}}>
        <Micro15Scene {...issue} groundDots={issue.groundDots.filter(dot => isGridCell(dot.cell))}/>
      </div>
      {s.outro && (scale < 1 || s.outro.elapsed > 0) && <svg className="micro20-world micro20-twinkle" viewBox="0 0 1280 720" aria-label="Spontaneously twinkling trace cells">
        <g transform={`translate(640 360) scale(${scale}) translate(-640 -360)`}>
          {s.outro.overlays.map(cell => cell.state.kind === 'dot'
            ? <circle key={cell.index} cx={cell.x} cy={cell.y} r="6" fill={COLORS.dot}/>
            : <image key={cell.index} href={staticFile(`micro-09/${cell.state.asset}`)} x={cell.x - SMALL_WARNING.width / 2} y={cell.y - SMALL_WARNING.height / 2} width={SMALL_WARNING.width} height={SMALL_WARNING.height}/>) }
        </g>
      </svg>}
      {showSubtitles && !sharedEntry && (s.outro
        ? <div className="micro20-subtitle-layer"><div className="micro20-subtitle">{OUTRO_TEXT}</div></div>
        : <Subtitles narration={s.narration} opacity={s.subtitleOpacity}/>)}
    </div>;
  }
  const p = s.progress;
  const expansion = unit(p.bashExpand);
  const halfCell = MACRO_GRID.pitch / (2 * s.contentScale);
  const camera = `translate(${s.origin.x} ${s.origin.y}) scale(${s.cameraScale})`;
  const hero = `scale(${s.contentScale})`;
  const world = `translate(${-s.bashAgent.x} ${-s.bashAgent.y})`;
  return <div className="micro20-composition" data-phase={s.phase} data-time={s.time}>
    <svg className="micro20-world" viewBox="0 0 1280 720" role="img" aria-label="A trace inspection recedes into a grid of traces and discovers issue patterns">
      <defs>
        <linearGradient id={`${id}-blue`} x2="0" y2="1"><stop stopColor="#a8caff"/><stop offset="1" stopColor="#75abff"/></linearGradient>
        <pattern id={`${id}-local-grid`} x={LOCAL_GRID.x} y={LOCAL_GRID.y} width="120" height="120" patternUnits="userSpaceOnUse">
          <path d="M.5 0V119.5H120" stroke="#333" fill="none"/>
        </pattern>
        <clipPath id={`${id}-hero-cell`}><rect x={-halfCell} y={-halfCell} width={2 * halfCell} height={2 * halfCell}/></clipPath>
      </defs>
      {!sharedEntry && <rect width="1280" height="720" fill={COLORS.background}/>}
      {/* One camera and one world persist across Bash, pullback and scan. */}
      <g data-world-camera transform={camera}>
        <circle data-radial-circle="behind-grid" r={s.radius / s.cameraScale} fill="#292929" opacity={1 - unit(p.analysisCircleFade)}/>
        <g data-local-grid transform={hero} opacity={sharedEntry ? 0 : 1 - unit(p.analysisLocalGridFade)}>
          <g transform={world}><rect x={s.camera.x - 1280 / s.contentScreenScale} y={s.camera.y - 720 / s.contentScreenScale}
            width={3840 / s.contentScreenScale} height={2160 / s.contentScreenScale} fill={`url(#${id}-local-grid)`}/></g>
        </g>
        <WorldGrid cameraScale={s.cameraScale} extended={extendedGrid}/>
        <g aria-label="one real centered macro cell per trace">
          {s.dots.map(dot => <g key={dot.cell} transform={`translate(${dot.worldX} ${dot.worldY})`}>
            <circle data-analysis-cell={dot.cell} r={60 * s.contentScale * dot.scale} fill={COLORS.dot}/>
          </g>)}
        </g>
        <g transform={hero} clipPath={`url(#${id}-hero-cell)`}>
          {/* Source17 collapses cell content under the same camera and clip. */}
          <g data-bash-content transform={`scale(1 ${1 - unit(p.analysisTraceCollapse)})`}>
            <g transform={world}>
              <ToolBlock x={-20} y={BASH.y} width={240} label="Write"/>
              <ToolBlock x={220} y={BASH.y} width={120} source={ASSETS.bashConnector}/>
              <ToolBlock x={BASH.x} y={BASH.y - 120 * expansion} width={360} label="Bash"/>
              <ToolBlock x={700} y={BASH.y} width={120} source={ASSETS.bashTool}/>
              <ToolBlock x={820} y={BASH.y} width={360} label="Thinking..."/>
              <ToolBlock x={1180} y={BASH.y} width={120} source={ASSETS.bashConnector}/>
              <foreignObject data-report x={BASH.x} y={BASH.y} width={BASH.width} height={s.paperHeight}
                style={{overflow: 'hidden', clipPath: `inset(${120 * (1 - expansion)}px 0 0 0)`}}>
                <div className="micro20-paper" style={{transform: `translateY(${-120 * (1 - expansion)}px)`}}>
                  {(traceContent?.lines ?? PAPER_LINES).map((line, index) => {
                    const highlight = (traceContent?.highlights ?? HIGHLIGHT_LINES).indexOf(index);
                    const amount = unit(p.bashHighlight * (traceContent?.highlights ?? HIGHLIGHT_LINES).length - highlight);
                    return <div className="micro20-paper-line" key={index} data-report-line={index} style={{height: PAPER_LINE_HEIGHT}}>{line}
                      {highlight >= 0 && <span data-highlight-line={index} className="micro20-highlight" style={{clipPath: `inset(0 ${100 * (1 - amount)}% 0 0)`}}>{line}</span>}
                    </div>;
                  })}
                </div>
              </foreignObject>
            </g>
          </g>
          {/* Nested local scale has no CSS transform-origin/viewBox conflict. */}
          <g data-blue-agent="hero" transform={`scale(${s.heroScreenScale / s.contentScreenScale})`}><g data-agent-scale transform={`scale(${1 - unit(p.analysisAgentScaleOut)})`}>
            <circle data-agent-circle r="60" fill={`url(#${id}-blue)`}/>
            <image href={staticFile(BLUE_LOADER)} x="-47.1" y="-47.1" width="94.2" height="94.2" transform={`rotate(${s.hero.angle})`}/>
          </g></g>
          {/* Detection marker shares the trace plane, never the camera target. */}
          <g data-detection-warning transform={`translate(${s.detectionWarning.x} ${s.detectionWarning.y}) scale(${s.detectionWarning.scale})`}>
            <image href={staticFile(`micro-16/${ASSETS.warning}`)} x="-43.3985" y="-40.302" width="86.797" height="80.604"/>
          </g>
        </g>
        {report}
        <g aria-label="warnings discovered by the visible circle">
          {s.warnings.map(warning => <g key={warning.id} transform={`translate(${warning.worldX} ${warning.worldY}) scale(${s.contentScale * warning.scale})`}>
            <image data-token-id={warning.id} data-radial-distance={warning.distance} data-warning-scale={warning.scale} href={warningAsset(warning.id)}
              x={-SMALL_WARNING.width * 5} y={-SMALL_WARNING.height * 5} width={SMALL_WARNING.width * 10} height={SMALL_WARNING.height * 10}/>
          </g>)}
        </g>
      </g>
    </svg>
    {showSubtitles && !sharedEntry && <Subtitles narration={s.narration} opacity={s.subtitleOpacity}/>}
  </div>;
};
