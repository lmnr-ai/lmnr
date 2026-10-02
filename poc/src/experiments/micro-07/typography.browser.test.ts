import {execFileSync} from 'node:child_process';

// Run against the tuning server; the isolated iframe imports Remotion's real
// stylesheet entry, so authoring CSS cannot hide a missing export stylesheet.
const base=process.env.PREVIEW_URL??'http://localhost:3002';
const browser=['--session','micro07-typography','--executable-path',process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
execFileSync('agent-browser',[...browser,'open',`${base}/?experiment=micro-07&time=10`],{stdio:'inherit'});
const result=execFileSync('agent-browser',['--session','micro07-typography','eval',`(async()=>{
 const check=(ok,message)=>{if(!ok)throw new Error(message)};
 const styles=element=>{const s=getComputedStyle(element);return {fontFamily:s.fontFamily,fontSize:s.fontSize,lineHeight:s.lineHeight,color:s.color,width:s.width}};
 const preview=styles(document.querySelector('.micro07-paper-line').closest('.micro07-paper'));
 const f=document.createElement('iframe');
 const loaded=new Promise(resolve=>{f.onload=resolve});
 f.srcdoc='<script type="module" src="/src/video/styles-entry.ts"></script><svg class="micro06-scene" data-scene="snail-straight"><foreignObject width="360" height="380"><div class="micro06-label">Thinking</div><div class="micro07-paper"><div class="micro07-paper-line" style="line-height:32px">Sample text</div></div><div class="micro06-label micro06-label-vertical">Bash</div></foreignObject></svg>';
 document.body.append(f);
 try{
  await loaded;
  const doc=f.contentDocument;
  const font=await new FontFace('SnailMono','url("/micro-07/JetBrainsMono-Regular.woff2")').load();
  doc.fonts.add(font);
  await doc.fonts.ready;
  const read=selector=>{const s=f.contentWindow.getComputedStyle(doc.querySelector(selector));return {fontFamily:s.fontFamily,fontSize:s.fontSize,lineHeight:s.lineHeight,color:s.color,width:s.width}};
  const paper=read('.micro07-paper'),label=read('.micro06-label'),line=read('.micro07-paper-line'),vertical=read('.micro06-label-vertical');
  check(paper.fontSize==='24px','export paper must be 24px, got '+paper.fontSize);
  check(paper.fontFamily.includes('SnailMono'),'export paper must use SnailMono, got '+paper.fontFamily);
  check(paper.color==='rgb(150, 150, 150)','export paper color mismatch: '+paper.color);
  check(label.fontSize==='48px'&&label.fontFamily.includes('SnailMono'),'header typography mismatch');
  check(line.lineHeight==='32px','deterministic paper line height mismatch');
  check(vertical.width==='120px','Micro 07 vertical label width mismatch');
  for(const key of ['fontFamily','fontSize','color','width'])check(paper[key]===preview[key],'preview/export '+key+' mismatch');
  const canvas=doc.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font='24px SnailMono';
  const advance=ctx.measureText('0123456789').width/10;
  check(Math.abs(advance-14.4)<.02,'font glyph advance must match deterministic paper layout: '+advance);
  doc.querySelector('svg').removeAttribute('data-scene');
  check(read('.micro06-label-vertical').width==='240px','Micro 07 CSS must not change Micro 06 vertical labels');
  return {passed:true,preview,export:paper,label,advance};
 }finally{f.remove()}
})()`],{encoding:'utf8'});
console.log(result);
