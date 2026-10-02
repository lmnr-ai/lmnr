// JetBrains Mono has a 600/1000-em advance. Explicit shared layout keeps
// wrapped highlight geometry deterministic in browser previews and Remotion.
export const PAPER_FONT_SIZE=24;
export const PAPER_ADVANCE=PAPER_FONT_SIZE*.6;
export const PAPER_LINE_HEIGHT=32;
export const PAPER_TEXT="I should check main.tsx for rendering issues. I don't need to focus on CSS because I assume the user already verified this, but I can use the linter to find any code smells.";
export const HIGHLIGHT_PHRASE='I assume the user already verified this';
const columns=Math.floor(336/PAPER_ADVANCE);
const phraseStart=PAPER_TEXT.indexOf(HIGHLIGHT_PHRASE);
export const PAPER_LINES=(()=>{
 const lines=[];let start=0;
 while(start<PAPER_TEXT.length){
  let end=Math.min(start+columns,PAPER_TEXT.length);
  if(end<PAPER_TEXT.length&&PAPER_TEXT[end]!==' ')end=PAPER_TEXT.lastIndexOf(' ',end);
  const from=Math.max(start,phraseStart),to=Math.min(end,phraseStart+HIGHLIGHT_PHRASE.length);
  lines.push({text:PAPER_TEXT.slice(start,end),highlight:to>from?{text:PAPER_TEXT.slice(from,to),column:from-start,offset:from-phraseStart,length:to-from}:null});
  start=end+1;
 }
 return lines;
})();
