import {useEffect,useId,useState} from 'react';
import {cancelRender,continueRender,delayRender,staticFile} from 'remotion';
import {COLORS,GRID,SMALL_WARNING,TOKEN_BY_ID,cellCoordinates,inwardBorderRects} from '../micro-14/geometry';
import {Micro15Scene} from '../micro-15/Scene';
import type {Micro20Sample} from './sample';

const LINES=['$ lmnr trace inspect --latest','trace 8fa2 · 184 spans','loading attributes…','grouping failures by signature','checking every span','issue candidates: 47','analysis ready'];
const BLUE_LOADER='introducing-flow-1/assets/c2c86b15f174d7c343dc01fc0325a94a36768e05.svg';
const warningAsset=(id:string)=>staticFile(`micro-14/small-${TOKEN_BY_ID.get(id)?.color}.svg`);
export const Micro20Scene=({sample}:{sample:Micro20Sample})=>{
  const id=`micro20-${useId().replace(/:/g,'')}`;
  const [handle]=useState(()=>delayRender('Load Animation 20 assets'));
  useEffect(()=>{const font=new FontFace('Micro20Mono',`url("${staticFile('micro-07/JetBrainsMono-Regular.woff2')}")`);const images=[staticFile(BLUE_LOADER),...sample.phase==='issues'?[]:sample.warnings.map(w=>warningAsset(w.id))];Promise.all([font.load().then(f=>document.fonts.add(f)),...images.map(src=>new Promise<void>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve();image.onerror=()=>reject(new Error(`Missing ${src}`));image.src=src}))]).then(()=>continueRender(handle)).catch(cancelRender);},[handle]);
  if(sample.phase==='issues')return <Micro15Scene {...sample.issue}/>;
  const analysis=sample.phase==='analysis';
  return <div className="micro20-composition" data-phase={sample.phase} data-time={sample.time} data-radial-order="distance">
    {!analysis&&<svg className="micro20-bash" viewBox="0 0 1280 720" aria-label="Inspecting a trace with a blue Bash agent">
      <defs><pattern id={`${id}-bash-grid`} width="120" height="120" patternUnits="userSpaceOnUse"><path d="M.5 0V119.5H120" stroke="#333" fill="none"/></pattern><linearGradient id={`${id}-blue`} x2="0" y2="1"><stop stopColor="#a8caff"/><stop offset="1" stopColor="#75abff"/></linearGradient></defs>
      <g transform={`translate(${-sample.camera.x} ${-sample.camera.y})`}><rect x="-500" y="0" width="2300" height="3800" fill={`url(#${id}-bash-grid)`}/><rect x="-20" y="1261" width="240" height="120" fill="#5c5c5c"/><text x="12" y="1338">Fetch</text><rect x="220" y="1261" width="120" height="120" fill="#333"/><rect x="340" y={1261-120*sample.progress.bashExpand} width="360" height="120" fill="#5c5c5c"/><text x="372" y={1338-120*sample.progress.bashExpand}>Inspect trace</text><rect x="700" y="1261" width="120" height="120" fill="#333"/>
      <foreignObject x="340" y="1261" width="360" height={sample.paperHeight} style={{overflow:'hidden'}}><div className="micro20-paper">{LINES.map((line,i)=>{const amount=i<5?0:Math.max(0,Math.min(1,sample.progress.bashHighlight*2-(i-5)));return <div key={line} data-highlight-line={i>=5?i:undefined} data-highlight-progress={amount} style={i>=5?{backgroundImage:'linear-gradient(#b8d4ff,#b8d4ff)',backgroundRepeat:'no-repeat',backgroundSize:`${amount*100}% 100%`}:undefined}>{line}</div>})}</div></foreignObject>
      <g data-blue-agent="bash" transform={`translate(${sample.bashAgent.x} ${sample.bashAgent.y})`}><circle r="60" fill={`url(#${id}-blue)`}/><image href={staticFile(BLUE_LOADER)} x="-47.1" y="-47.1" width="94.2" height="94.2" transform={`rotate(${sample.bashAgent.angle})`}/></g></g>
    </svg>}
    {analysis&&<svg className="micro20-analysis" viewBox="0 0 1280 720" role="img" aria-label="Analyzing every trace for issue patterns">
      <defs><linearGradient id={`${id}-blue`} x2="0" y2="1"><stop stopColor="#a8caff"/><stop offset="1" stopColor="#75abff"/></linearGradient></defs><rect width="1280" height="720" fill={COLORS.background}/>
      <g data-analysis-zoom={sample.zoom} transform={`translate(640 360) scale(${Math.pow(4800/78,1-sample.zoom)}) translate(-640 -360)`}>
        <circle data-radial-circle="behind-grid" cx="640" cy="360" r={sample.radius} fill="#292929" opacity={1-sample.progress.analysisCircleFade}/>
        <g aria-label="18 by 12 analysis grid">{Array.from({length:216},(_,cell)=>{const {column,row}=cellCoordinates(cell);const b=inwardBorderRects(GRID.x+column*GRID.cell,GRID.y+row*GRID.cell,GRID.cell,GRID.cell);return <g key={cell} fill={COLORS.grid}><rect {...b.left}/><rect {...b.bottom}/></g>})}</g>
        <g aria-label="one trace dot per cell">{sample.dots.map(d=><circle key={d.cell} data-analysis-cell={d.cell} cx={d.x} cy={d.y} r="6" fill={COLORS.dot} transform={`translate(${d.x} ${d.y}) scale(${d.scale}) translate(${-d.x} ${-d.y})`}/>)}</g>
        <g aria-label="radially discovered warnings">{sample.warnings.map(w=><image key={w.id} data-token-id={w.id} data-radial-distance={Math.hypot(w.x-640,w.y-360)} href={warningAsset(w.id)} x={w.x-SMALL_WARNING.width/2} y={w.y-SMALL_WARNING.height/2} width={SMALL_WARNING.width} height={SMALL_WARNING.height} transform={`translate(${w.x} ${w.y}) scale(${w.scale}) translate(${-w.x} ${-w.y})`}/>)}</g>
      </g>
      <g data-blue-agent="center" transform={`translate(640 360) scale(${sample.hero.scale})`}><circle r="60" fill={`url(#${id}-blue)`}/><image href={staticFile(BLUE_LOADER)} x="-47.1" y="-47.1" width="94.2" height="94.2" transform={`rotate(${sample.hero.angle})`}/></g>
    </svg>}
  </div>;
};
