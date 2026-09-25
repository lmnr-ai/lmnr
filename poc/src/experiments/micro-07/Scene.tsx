import {useEffect,useId,useState} from 'react';
import {cancelRender,continueRender,delayRender,staticFile} from 'remotion';
import {BLOCKS,CELL,ELBOW,blockOutline,pose} from './geometry';
import {blockReveal} from './routeMask';
import {PAPER_LINES,PAPER_ADVANCE,PAPER_LINE_HEIGHT,HIGHLIGHT_PHRASE} from './paper';
import {blockPaint,gradientEndpoints,SCENE_PALETTES,type SnailPalette} from './palette';

export type ReasoningProgress={bubbleEnter?:number;cameraReturn?:number;redThinkingLift?:number;readLift?:number;thinkingLift?:number;highlight?:number};
export type Micro07SceneProps={palette?:SnailPalette;travelProgress?:number;agentScale?:number;time?:number;spinnerSpeed?:number;highlightPadding?:number;elbowRise?:number;reasoning?:ReasoningProgress};
const clamp=(p:number)=>Math.max(0,Math.min(1,p));
export const Micro07Scene=({travelProgress=0,agentScale=1,time=0,spinnerSpeed=1.9,highlightPadding=2,palette='vibrant',elbowRise=0,reasoning={}}:Micro07SceneProps)=>{
 const [fontHandle]=useState(()=>delayRender('Load Snail typography'));
 useEffect(()=>{const font=new FontFace('SnailMono',`url("${staticFile('micro-07/JetBrainsMono-Regular.woff2')}")`);let active=true;font.load().then(loaded=>{if(active)document.fonts.add(loaded);continueRender(fontHandle);}).catch(error=>{if(active)cancelRender(error);});return()=>{active=false;document.fonts.delete(font);};},[fontHandle]);
 const id=`straight-${useId().replace(/:/g,'')}`,colors=SCENE_PALETTES[palette],state=pose(travelProgress),target=BLOCKS.find(block=>block.id==='later-thinking-blue')!,returnBlocks=BLOCKS.filter(block=>['later-thinking-blue','later-read','later-thinking-red'].includes(block.id));
 // Camera follows only through the elbow. The loader remains in world space and
 // completes the vertical route while cameraReturn independently reframes it.
 const ret=clamp(reasoning.cameraReturn??0),focusStart=elbowRise>0?ELBOW:state.point,returnTarget={x:target.x+180,y:target.y+60},focus={x:focusStart.x+(returnTarget.x-focusStart.x)*ret,y:focusStart.y+(returnTarget.y-focusStart.y)*ret},camera={x:640-focus.x,y:360-focus.y};
 const distance=state.distance,ref=(n:string)=>`url(#${id}-${n})`,paper=clamp(reasoning.thinkingLift??0),highlight=clamp(reasoning.highlight??0),bubble=clamp(reasoning.bubbleEnter??0);
 const markerPadding=Math.max(0,Math.min(6,highlightPadding));
 const reveals=new Map(BLOCKS.map(block=>[block.id,blockReveal(block,distance)]));
 const revealClip=(block:typeof BLOCKS[number])=>reveals.get(block.id)!.complete?undefined:ref(`${block.id}-reveal`);
 return <svg className="micro06-scene" style={{background:colors.background}} viewBox="0 0 1280 720" data-scene="snail-straight" data-camera-x={camera.x} data-camera-y={camera.y}><defs>
  <pattern id={`${id}-grid`} width={CELL} height={CELL} patternUnits="userSpaceOnUse"><path d="M0 0V120H120" fill="none" stroke={colors.grid} strokeWidth="1"/></pattern>
  {BLOCKS.map(block=>{const paint=blockPaint(block,palette);if(!paint.colors)return null;const endpoints=paint.angle!==undefined?gradientEndpoints(paint.angle,block.w,block.h):{x1:0,y1:0,x2:block.vertical?0:1,y2:block.vertical?1:0};return <linearGradient key={block.id} id={`${id}-${block.id}`} {...endpoints}>{paint.colors.map((color,index)=><stop key={color} offset={index/(paint.colors!.length-1)} stopColor={color}/>)}</linearGradient>;})}
  {BLOCKS.map(block=>{const region=reveals.get(block.id)!;return <clipPath key={`${block.id}-reveal`} id={`${id}-${block.id}-reveal`} clipPathUnits="userSpaceOnUse">{region.rects.map((rect,index)=><rect key={`rect-${index}`} {...rect}/>)}{region.circles.map((circle,index)=><circle key={`circle-${index}`} {...circle}/>)}</clipPath>;})}
  {BLOCKS.filter(block=>block.asset).map(block=><clipPath key={block.id} id={`${id}-${block.id}-clip`}><path d={blockOutline(block)} transform={`translate(${block.x} ${block.y})`}/></clipPath>)}
 </defs><rect width="1280" height="720" fill={colors.background}/><g transform={`translate(${camera.x} ${camera.y})`}>
  <rect x={-camera.x-1} y={-camera.y-1} width="1282" height="722" fill={ref('grid')}/><g>{BLOCKS.filter(block=>!returnBlocks.includes(block)).map(block=>{return <g key={block.id} clipPath={revealClip(block)}>{block.asset?<g clipPath={ref(`${block.id}-clip`)}><image href={staticFile(`micro-07/${block.asset.replace('.svg','-square.svg')}`)} x={block.x} y={block.y} width={block.w} height={block.h}/></g>:<>{block.id==='thinking-blue'?<path d={`M${block.x+CELL/2} ${block.y}H${block.x+block.w}V${block.y+block.h}H${block.x+CELL/2}A${CELL/2} ${CELL/2} 0 0 1 ${block.x} ${block.y+CELL/2}A${CELL/2} ${CELL/2} 0 0 1 ${block.x+CELL/2} ${block.y}Z`} fill={ref(block.id)}/>:<rect x={block.x} y={block.y} width={block.w} height={block.h} fill={ref(block.id)}/>}<foreignObject x={block.x} y={block.y} width={block.w} height={block.h}><div className={`micro06-label${block.vertical?' micro06-label-vertical':''}`} style={{paddingLeft:block.textX??32}}>{block.label}</div></foreignObject></>}</g>;})}</g>
  {/* Reveal clips live inside each lift transform, so raised headers keep
      their visited area without intersecting any neighboring block's cover. */}
  <g>{returnBlocks.map(block=>{const blockLift=clamp(block.id==='later-thinking-red'?(reasoning.redThinkingLift??0):block.id==='later-read'?(reasoning.readLift??0):(reasoning.thinkingLift??0))*CELL;return <g key={block.id} transform={`translate(0 ${-blockLift})`}><g clipPath={revealClip(block)}><rect x={block.x} y={block.y} width={block.w} height={block.h} fill={ref(block.id)}/><foreignObject x={block.x} y={block.y} width={block.w} height={block.h}><div className="micro06-label" style={{paddingLeft:block.textX??32}}>{block.label}</div></foreignObject></g></g>;})}</g>
  {/* The door rises, but the paper's viewport stays in the original column.
      Paper starts bottom-aligned with the closed block, then descends until
      its top reaches the original block top. The door edge clips the reveal. */}
  {returnBlocks.filter(block=>block.id!=='later-thinking-blue').map(block=>{
   const progress=clamp(block.id==='later-read'?(reasoning.readLift??0):(reasoning.redThinkingLift??0));
   const copy=block.id==='later-read'
    ? 'src/main.tsx\nApp mounts in StrictMode. No CSS inspected. No browser verification recorded.'
    : 'The entry point looks fine. I’ll run the linter to narrow this down. If it passes, I’ll inspect the component that renders this view.';
   return <foreignObject key={`${block.id}-paper`} x={block.x} y={block.y} width={block.w} height="260" style={{overflow:'hidden',clipPath:`inset(${CELL*(1-progress)}px 0 0 0)`}}><div className="micro07-paper" style={{width:block.w,whiteSpace:'pre-line',transform:`translateY(${(CELL-260)*(1-progress)}px)`}}>{copy}</div></foreignObject>;
  })}
  {/* Blue uses the same fixed viewport and independently descending paper. */}
  <foreignObject x={target.x} y={target.y} width="360" height="260" style={{overflow:'hidden',clipPath:`inset(${CELL*(1-paper)}px 0 0 0)`}}><div className="micro07-paper" style={{transform:`translateY(${(CELL-260)*(1-paper)}px)`}}>
   {PAPER_LINES.map((line,index)=>{
    const fragment=line.highlight;
    const progress=fragment?clamp((highlight*HIGHLIGHT_PHRASE.length-fragment.offset)/fragment.length):0;
    return <div key={index} className="micro07-paper-line" style={{lineHeight:`${PAPER_LINE_HEIGHT}px`}}>{line.text}{fragment&&<span aria-hidden="true" className="micro07-highlight-overlay" style={{left:fragment.column*PAPER_ADVANCE-markerPadding,top:-markerPadding,width:fragment.length*PAPER_ADVANCE+markerPadding*2,padding:markerPadding,clipPath:`inset(0 ${100*(1-progress)}% 0 0)`}}>{fragment.text}</span>}</div>;
   })}
  </div></foreignObject>
  <g transform={`translate(${ELBOW.x+CELL/2} ${ELBOW.y+CELL/2}) scale(${bubble})`} opacity={bubble}><path d="M0 0H60A60 60 0 0 1 120 60V60A60 60 0 0 1 60 120H60A60 60 0 0 1 0 60Z" fill="#f47069"/><text x="26" y="76" fontFamily="SnailMono,monospace" fontSize="48" letterSpacing="-9.6" fill="#0e0f21">!!!</text></g>
  {/* Loader belongs to the world, never to the camera. */}<g transform={`translate(${state.point.x} ${state.point.y}) scale(${agentScale})`} className="micro06-agent"><circle r="60" fill="white"/><image href={staticFile('micro-07/spinner.svg')} x="-44.5" y="-44.5" width="89" height="89" transform={`rotate(${time*360*spinnerSpeed})`}/></g>
 </g></svg>;
};
