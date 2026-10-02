#!/usr/bin/env bash
set -euo pipefail
session="cost-zip-recovery-$$"
browser(){ agent-browser --session "$session" "$@"; }
trap 'browser close >/dev/null 2>&1 || true' EXIT
browser --executable-path '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' open 'http://localhost:5180/?experiment=micro-18'
browser eval '(async()=>{
 const {normalizeSettings}=await import("/src/experiments/micro-18/settings.ts");
 const {CURRENT_VOICEOVER_DEFAULTS}=await import("/src/experiments/micro-18/current-cut.ts");
 const before=normalizeSettings((await import("/handoff/glide-linger-current/settings.json")).default);
 const partial={...CURRENT_VOICEOVER_DEFAULTS,costTimingRecoveryVersion:undefined,cost:before.cost,pacing:before.pacing};
 localStorage.setItem("ultimate3-before-cost-lead-in-v1",JSON.stringify(before));
 localStorage.setItem("ultimate3-voiceover-retime-settings-v4",JSON.stringify(partial));
 localStorage.removeItem("ultimate3-before-cost-timing-recovery-v1");
 const values=Object.fromEntries(Object.entries(before.cost.timing).flatMap(([key,c])=>[[key+".at",c.at],[key+".duration",c.duration],[key+".transition",c.transition]]));
 localStorage.setItem("dialkit:ultimate3-voiceover-cost-v4",JSON.stringify({version:1,values,baseValues:values,presets:[{id:"keep",name:"Retained Cost",values}],activePresetId:null}));
 sessionStorage.setItem("before",JSON.stringify(before));sessionStorage.setItem("partial",JSON.stringify(partial));
 return "seeded observed partial migration plus stale Cost panel";
})()'
browser reload
browser eval '(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const s=JSON.parse(localStorage.getItem("ultimate3-voiceover-retime-settings-v4")),b=JSON.parse(sessionStorage.getItem("before"));for(const [key,c] of Object.entries(b.cost.timing))if(Math.abs(s.cost.timing[key].at-c.at-1.5)>1e-8)throw Error("Still out of sync: "+key);if(localStorage.getItem("ultimate3-before-cost-timing-recovery-v1")!==sessionStorage.getItem("partial"))throw Error("Missing recovery backup");sessionStorage.setItem("repaired",JSON.stringify(s));return "PASS every Cost bar +1.5 local seconds"})()'
browser click '.micro18-nav button:has-text("16 Cost")'
browser eval '(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const s=JSON.parse(localStorage.getItem("ultimate3-voiceover-retime-settings-v4"));if(JSON.stringify(s)!==sessionStorage.getItem("repaired"))throw Error("Detail panel overwrote recovered timings");const panel=JSON.parse(localStorage.getItem("dialkit:ultimate3-voiceover-cost-v4"));if(Math.abs(panel.presets[0].values["cheapLegOneRight.at"]-JSON.parse(sessionStorage.getItem("before")).cost.timing.cheapLegOneRight.at)>1e-8)throw Error("Historical preset changed: "+panel.presets[0].values["cheapLegOneRight.at"]);return "PASS stale Cost panel cannot overwrite recovery; preset preserved"})()'
browser reload
browser eval '(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(localStorage.getItem("ultimate3-voiceover-retime-settings-v4")!==sessionStorage.getItem("repaired"))throw Error("Recovery repeated");return "PASS second reload unchanged"})()'
# Move the actual native group bar about 0.5s; all three legs must move together.
coords=$(browser eval '(()=>{const el=document.querySelector("[title^=\"Yellow Agent Zip —\"]");if(!el)throw Error("Missing zip bar");el.scrollIntoView({block:"center"});const r=el.getBoundingClientRect();return [Math.round(r.x+r.width/2),Math.round(r.y+r.height/2),r.width/1.36]})()')
read -r x y scale <<< "$(echo "$coords" | python3 -c 'import json,sys;print(*json.load(sys.stdin))')"
target=$(python3 -c "print(round($x+.5*$scale))")
browser mouse move "$x" "$y"; browser mouse down; browser mouse move "$target" "$y"; browser mouse up
browser eval '(()=>{const s=JSON.parse(localStorage.getItem("ultimate3-voiceover-retime-settings-v4")),b=JSON.parse(sessionStorage.getItem("repaired"));const keys=["cheapLegOneRight","cheapLegTwoLeft","cheapLegThreeRight"],delta=s.cost.timing[keys[0]].at-b.cost.timing[keys[0]].at;if(delta<.3)throw Error("Real drag failed");for(const key of keys)if(Math.abs(s.cost.timing[key].at-b.cost.timing[key].at-delta)>1e-8)throw Error("Rungs detached");for(const key of Object.keys(s.cost.timing))if(!keys.includes(key)&&JSON.stringify(s.cost.timing[key])!==JSON.stringify(b.cost.timing[key]))throw Error("Moved unrelated action: "+key);if(JSON.stringify(s.voiceover)!==JSON.stringify(b.voiceover))throw Error("Moved speech");sessionStorage.setItem("moved",JSON.stringify(s));return "PASS native group drag, all rungs move together, speech untouched"})()'
coords=$(browser eval '(()=>{const el=document.querySelector("[title^=\"Yellow Agent Zip —\"] [data-edge=end]");const r=el.getBoundingClientRect();return [Math.round(r.x+r.width/2),Math.round(r.y+r.height/2)]})()')
read -r x y <<< "$(echo "$coords" | python3 -c 'import json,sys;print(*json.load(sys.stdin))')"
target=$(python3 -c "print(round($x+.5*$scale))")
browser mouse move "$x" "$y"; browser mouse down; browser mouse move "$target" "$y"; browser mouse up
browser eval '(async()=>{const s=JSON.parse(localStorage.getItem("ultimate3-voiceover-retime-settings-v4")),b=JSON.parse(sessionStorage.getItem("moved"));const keys=["cheapLegOneRight","cheapLegTwoLeft","cheapLegThreeRight"],first=b.cost.timing[keys[0]].at,ratio=s.cost.timing[keys[0]].duration/b.cost.timing[keys[0]].duration;if(ratio<=1.1)throw Error("Resize failed");for(const key of keys){if(Math.abs(s.cost.timing[key].duration-b.cost.timing[key].duration*ratio)>1e-8||Math.abs(s.cost.timing[key].at-(first+(b.cost.timing[key].at-first)*ratio))>1e-8)throw Error("Resize detached "+key);}
 const sdk=await import((await (await fetch("/src/experiments/micro-18/App.tsx")).text()).match(/from "([^"\n]*\/dialkit\.js[^"\n]*)"/)[1]);
 const {sampleUltimate3}=await import("/src/experiments/micro-18/sample.ts");
 for(const time of [21.8,20.4,21,20.4]){sdk.TimelineStore.seek("ultimate3-voiceover-main-v4",time);await new Promise(r=>setTimeout(r,80));const expected=sampleUltimate3(time,s).cost.cheapAgents;const agents=[...document.querySelectorAll("[data-agent=cheap]")];if(agents.length!==3)throw Error("Missing rungs");agents.forEach((agent,i)=>{const xy=agent.getAttribute("transform").match(/translate\(([^ ]+) ([^)]+)\)/);if(Math.abs(Number(xy[1])-expected[i].x)>1e-7||Math.abs(Number(xy[2])-expected[i].y)>1e-7)throw Error("Live/export pose mismatch at "+time);});}
 sessionStorage.setItem("edited",JSON.stringify(s));return "PASS resize, reverse seeks, actual three-rung poses vs export";
})()'
browser reload
browser eval '(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(localStorage.getItem("ultimate3-voiceover-retime-settings-v4")!==sessionStorage.getItem("edited"))throw Error("Reload changed group edit");return "PASS group edit persists"})()'
browser click '.micro18-settings summary'
browser click '.micro18-settings button:has-text("Export")'
browser eval '(()=>{if(JSON.stringify(JSON.parse(document.querySelector("textarea[aria-label=\"Ultimate 3 settings JSON\"]").value))!==sessionStorage.getItem("edited"))throw Error("Export mismatch");return "PASS real Settings JSON export"})()'
