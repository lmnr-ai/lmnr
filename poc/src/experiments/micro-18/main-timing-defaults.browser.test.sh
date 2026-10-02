#!/usr/bin/env bash
# Fresh isolated profile; use the already-running Vite server and installed Chrome.
set -euo pipefail
session="main-timing-defaults-$$"
browser(){ agent-browser --session "$session" "$@"; }
trap 'browser close >/dev/null 2>&1 || true' EXIT
browser --executable-path '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' open 'http://localhost:5180/?experiment=micro-18'
browser eval '(async()=>{
 const requested=(await import("/src/experiments/micro-18/main-timing-request.fixture.json")).default;
 const {DialStore,TimelineStore}=await import((await (await fetch("/src/experiments/micro-18/App.tsx")).text()).match(/from "([^"\n]*\/dialkit\.js[^"\n]*)"/)[1]);
 const id="ultimate3-voiceover-main-v4";
 const near=(actual,expected,label)=>{if(typeof actual!=="number"||Math.abs(actual-expected)>1e-8)throw Error(label+": "+actual+" != "+expected)};
 for(const [key,clip] of Object.entries(requested)){
  near(DialStore.getValue(id,key+".at"),clip.at,key+".at");near(DialStore.getValue(id,key+".duration"),clip.duration,key+".duration");
  const transition=DialStore.getValue(id,key+".transition");
  if(transition?.type!=="easing"||JSON.stringify(transition.ease)!==JSON.stringify(clip.ease??[0,0,1,1]))throw Error("Wrong curve: "+key);
  near(transition.duration,clip.duration,key+".transition.duration");
  near(DialStore.getValue(id,key+".from.progress"),0,key+".from");near(DialStore.getValue(id,key+".to.progress"),1,key+".to");
 }
 const settings=JSON.parse(localStorage.getItem("ultimate3-voiceover-retime-settings-v4"));
 const {sampleUltimate3}=await import("/src/experiments/micro-18/sample.ts");
 for(const time of [18.9,19.6,20.3,18.9]){
  TimelineStore.seek(id,time);await new Promise(r=>setTimeout(r,80));
  const expected=sampleUltimate3(time,settings).cost.cheapAgents;
  const agents=[...document.querySelectorAll("[data-agent=cheap]")];if(agents.length!==3)throw Error("Missing yellow agents");
  agents.forEach((agent,i)=>{const xy=agent.getAttribute("transform").match(/translate\(([^ ]+) ([^)]+)\)/);near(Number(xy[1]),expected[i].x,"agent "+i+" x");near(Number(xy[2]),expected[i].y,"agent "+i+" y")});
 }
 sessionStorage.setItem("approvedMainSettings",JSON.stringify(settings));
 return "PASS all 31 requested native clips, easing, endpoints and forward/reverse three-rung export poses";
})()'
browser reload
browser eval '(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(localStorage.getItem("ultimate3-voiceover-retime-settings-v4")!==sessionStorage.getItem("approvedMainSettings"))throw Error("Reload changed approved defaults");return "PASS defaults survive reload"})()'
browser click '.micro18-settings summary'
browser click '.micro18-settings button:has-text("Export")'
browser eval '(()=>{if(JSON.stringify(JSON.parse(document.querySelector("textarea[aria-label=\"Ultimate 3 settings JSON\"]").value))!==sessionStorage.getItem("approvedMainSettings"))throw Error("Export differs from preview defaults");return "PASS actual Settings JSON export"})()'
