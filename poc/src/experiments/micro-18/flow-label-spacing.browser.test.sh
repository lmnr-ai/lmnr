#!/usr/bin/env bash
set -euo pipefail
session="flow-label-spacing-$$"
browser(){ agent-browser --session "$session" "$@"; }
trap 'browser close >/dev/null 2>&1 || true' EXIT
browser --executable-path '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' open 'http://localhost:5180/?experiment=micro-18'
browser eval '(async()=>{
 const {TimelineStore}=await import((await (await fetch("/src/experiments/micro-18/App.tsx")).text()).match(/from "([^"\n]*\/dialkit\.js[^"\n]*)"/)[1]);
 await document.fonts.ready;
 const evidence=[];
 for(const time of [35.5,36.4,35.5]){
  TimelineStore.seek("ultimate3-voiceover-main-v4",time);await new Promise(r=>setTimeout(r,100));
  const rect=selector=>{const el=document.querySelector(selector);if(!el)throw Error("Missing "+selector);return el.getBoundingClientRect()};
  const flow=rect(".flow2-flow-label"),sol=rect(".flow2-model[data-model=sol] span:last-child"),gemini=rect(".flow2-model[data-model=gemini] span:last-child"),luna=rect(".flow2-model[data-model=luna] span:last-child");
  const upper=sol.top-flow.top,lower=luna.top-gemini.top;
  if(Math.abs(upper-lower)>.05)throw Error("Unequal gaps: "+upper+" vs "+lower);
  if(sol.top<flow.bottom-.05||luna.top<gemini.bottom-.05)throw Error("Overlapping labels");
  const stage=rect(".micro18-authored");
  for(const [id,value] of [["opus","84.8"],["sonnet","77.3"],["sol","72.8"]]){
   const model=document.querySelector(".flow2-model[data-model="+id+"]");
   if(model.dataset.descF1!==value||model.querySelector(".flow2-score").textContent!==value)throw Error("Wrong "+id+" score");
   const name=model.querySelector("span:last-child").getBoundingClientRect();
   if(name.top<stage.top-.05||name.bottom>stage.bottom+.05)throw Error(id+" label clipped: "+JSON.stringify({top:name.top,stageTop:stage.top,bottom:name.bottom,stageBottom:stage.bottom}));
  }
  const score=document.querySelector(".flow2-flow-score");
  if(score.textContent!=="74.1%"||Number(getComputedStyle(score).opacity)<.99)throw Error("Wrong or hidden flow score");
  if(rect(".flow2-model[data-model=sol] .flow2-score").top<score.getBoundingClientRect().bottom-.05)throw Error("Overlapping scores");
  if(document.querySelector("[data-voiceover-caption]").textContent!=="Matching GPT-6-Sol in intelligence, while analyzing 20 times more traces per dollar.")throw Error("Wrong subtitle");
  evidence.push({time,flowSolGap:upper,geminiLunaGap:lower,labelClearance:sol.top-flow.bottom,score:score.textContent});
 }
 return {passed:"subtitle, score, equal rendered gaps, no label/score overlap, reverse seek",evidence};
})()'
