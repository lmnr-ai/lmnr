#!/usr/bin/env bash
# Existing Vite only; isolated installed-Chrome profile. No video/audio server launches.
set -euo pipefail
session="ultimate-cost-cloud-$$"
work="${COST_CLOUD_EVIDENCE:-$(mktemp -d /tmp/ultimate-cost-cloud.XXXXXX)}"
mkdir -p "$work"
browser(){ agent-browser --session "$session" "$@"; }
trap 'browser close >/dev/null 2>&1 || true' EXIT
browser --executable-path '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' open 'http://localhost:5180/?experiment=micro-18'
browser eval '(async()=>{
 const {normalizeSettings}=await import("/src/experiments/micro-18/settings.ts");
 const before=normalizeSettings((await import("/handoff/glide-linger-current/settings.json")).default);
 before.currentCutVersion=1;delete before.costLeadInVersion;
 before.cost.controls.smokeSize=.7;
 before.cost.timing.cloudSweep={at:.35,duration:1.1,from:{progress:.05},to:{progress:.95},transition:{type:"spring",stiffness:140,damping:18,mass:1}};
 const values=Object.fromEntries(Object.entries(before.cost.timing).flatMap(([k,c])=>[[k+".at",c.at],[k+".duration",c.duration],[k+".transition",c.transition]]));
 Object.assign(values,{"cloudSweep.from.progress":.05,"cloudSweep.to.progress":.95,"cloudSweep.transition.__mode":"advanced"});
 const preset={id:"keep-cost",name:"Keep custom spring",values:{...values,"cloudSweep.at":.6}};
 localStorage.setItem("dialkit:ultimate3-voiceover-cost-v4",JSON.stringify({version:1,values,baseValues:{...values},presets:[preset],activePresetId:null}));
 const main=JSON.parse(localStorage.getItem("dialkit:ultimate3-voiceover-main-v4"));
 for(const group of [main.values,main.baseValues]){group["ultimate2.duration"]=19.06;group["cost.at"]=19.06;group["cost.duration"]=9.37;for(const k of Object.keys(group))if(k.startsWith("cloudsSlideOut."))delete group[k];}
 localStorage.setItem("dialkit:ultimate3-voiceover-main-v4",JSON.stringify(main));
 sessionStorage.setItem("expectedCostPreset",JSON.stringify(preset));sessionStorage.setItem("beforeSettings",JSON.stringify(before));
 localStorage.setItem("ultimate3-voiceover-retime-settings-v4",JSON.stringify(before));localStorage.removeItem("ultimate3-before-cost-lead-in-v1");
 return "seeded legacy Main and Cost stores with custom settings/physics preset";
})()'
browser reload
browser wait 200
browser eval '(()=>{const s=JSON.parse(localStorage.getItem("ultimate3-voiceover-retime-settings-v4"));if(s.allocations.ultimate2!==17.56||s.allocations.cost!==10.87||Math.abs(s.pacing.ultimate2HandoffHold-.15)>1e-9||s.cost.timing.cloudSweep.at!==1.85||s.cost.timing.cloudSweep.duration!==1.1||s.cost.controls.smokeSize!==.7||s.costLeadInVersion!==1)throw Error("Cold migration or Main sync failed");if(localStorage.getItem("ultimate3-before-cost-lead-in-v1")!==sessionStorage.getItem("beforeSettings"))throw Error("Missing exact backup");sessionStorage.setItem("migrated",JSON.stringify(s));return "PASS cold migration, custom curve, duration, controls and backup"})()'
browser click '.micro18-nav button:has-text("16 Cost")'
browser wait 150
browser eval '(async()=>{const {DialStore}=await import((await (await fetch("/src/experiments/micro-18/App.tsx")).text()).match(/from "([^"\n]*\/dialkit\.js[^"\n]*)"/)[1]);const id="ultimate3-voiceover-cost-v4";const expected=JSON.parse(sessionStorage.getItem("expectedCostPreset")),actual=DialStore.getPresets(id)[0];if(actual?.id!==expected.id||actual.name!==expected.name||Object.entries(expected.values).some(([k,v])=>typeof v==="number"?Math.abs(actual.values[k]-v)>1e-9:JSON.stringify(actual.values[k])!==JSON.stringify(v)))throw Error("Preset authored fields changed on registration: "+JSON.stringify(Object.entries(expected.values).filter(([k,v])=>JSON.stringify(actual.values[k])!==JSON.stringify(v))));if(DialStore.getValue(id,"cloudSweep.at")!==1.85||DialStore.getValue(id,"cloudSweep.duration")!==1.1||DialStore.getValue(id,"cloudSweep.transition").stiffness!==140)throw Error("Legacy Cost store overwrote translated native clip");return "PASS native Cost sync and preserved independent physics preset"})()'
browser reload
browser wait 150
browser eval '(()=>{const s=JSON.parse(localStorage.getItem("ultimate3-voiceover-retime-settings-v4"));if(JSON.stringify(s)!==sessionStorage.getItem("migrated"))throw Error("Reload repeated/rewrote migration");return "PASS second cold reload idempotent"})()'
# Restore fresh migrated picture in this owned profile before actual pointer authoring.
browser eval '(async()=>{const {COST_LEAD_IN_DEFAULTS:s}=await import("/src/experiments/micro-18/current-cut.ts");localStorage.setItem("ultimate3-voiceover-retime-settings-v4",JSON.stringify(s));return true})()'
browser reload
browser wait 100
# Drag the real native alias, not a synthetic settings change. Center avoids the sticky header.
coords=$(browser eval '(()=>{const el=document.querySelector("[title^=\"Clouds Slide Out —\"]");el.scrollIntoView({block:"center"});const r=el.getBoundingClientRect();return [Math.round(r.x+r.width/2),Math.round(r.y+r.height/2),r.width/3.26]})()')
read -r x y scale <<< "$(echo "$coords" | python3 -c 'import json,sys;print(*json.load(sys.stdin))')"
target=$(python3 -c "print(round($x-1.4*$scale))")
browser mouse move "$x" "$y";browser mouse down;browser mouse move "$target" "$y";browser mouse up
browser eval '(()=>{const s=JSON.parse(localStorage.getItem("ultimate3-voiceover-retime-settings-v4"));if(s.cost.timing.cloudSweep.at>=.3)throw Error("Real cloud bar drag was clamped to old boundary");return {draggedLocalAt:s.cost.timing.cloudSweep.at}})()'
# Native resize handle; curve duration remains independently editable in DialKit.
coords=$(browser eval '(()=>{const el=document.querySelector("[title^=\"Clouds Slide Out —\"] [data-edge=end]");const r=el.getBoundingClientRect();return [Math.round(r.x+r.width/2),Math.round(r.y+r.height/2)]})()')
read -r x y <<< "$(echo "$coords" | python3 -c 'import json,sys;print(*json.load(sys.stdin))')"
target=$(python3 -c "print(round($x-2.4*$scale))")
browser mouse move "$x" "$y";browser mouse down;browser mouse move "$target" "$y";browser mouse up
browser eval '(async()=>{const {DialStore,TimelineStore}=await import((await (await fetch("/src/experiments/micro-18/App.tsx")).text()).match(/from "([^"\n]*\/dialkit\.js[^"\n]*)"/)[1]);const id="ultimate3-voiceover-main-v4";if(DialStore.getValue(id,"cloudsSlideOut.duration")>=1.1)throw Error("Native resize failed");DialStore.updateValues(id,{"cloudsSlideOut.from.progress":.2,"cloudsSlideOut.to.progress":.9,"cloudsSlideOut.transition":{type:"easing",duration:.8,ease:[0,0,1,1]}});TimelineStore.seek(id,18.3);return "native resize and endpoint/easing edits"})()'
browser wait 150
browser screenshot "$work/early-reveal.png"
# Compare the actual rendered canvas against the same pure cloud renderer used by export.
browser eval '(async()=>{
 const {DialStore,TimelineStore}=await import((await (await fetch("/src/experiments/micro-18/App.tsx")).text()).match(/from "([^"\n]*\/dialkit\.js[^"\n]*)"/)[1]);const {sampleUltimate3}=await import("/src/experiments/micro-18/sample.ts");
 const {createCloudRenderer}=await import("/src/experiments/micro-09/DitherClouds.tsx");const {DITHER_DEFAULTS}=await import("/src/experiments/micro-08/dither.ts");
 const id="ultimate3-voiceover-main-v4",wait=()=>new Promise(r=>setTimeout(r,80));
 const check=async time=>{TimelineStore.seek(id,time);await wait();const s=JSON.parse(localStorage.getItem("ultimate3-voiceover-retime-settings-v4")),sample=sampleUltimate3(time,s);const actual=document.querySelector(".micro18-frame > canvas.micro09-clouds");const c=document.createElement("canvas");c.width=1280;c.height=720;const image=new Image();image.src="/micro-09/image-219.png";await image.decode();const renderer=createCloudRenderer(c,image);renderer.draw(sample.cost.cloud.progress,DITHER_DEFAULTS,27+10*sample.cost.cloud.progress,sample.cost.cloud.translateY);if(actual.toDataURL()!==c.toDataURL())throw Error("Live/export native cloud mismatch at "+time+" rendered="+document.querySelector(".micro18-app").dataset.time+" progress="+sample.cost.cloud.progress+" clip="+JSON.stringify(TimelineStore.getTimeline(id).clips.find(c=>c.key==="cloudsSlideOut")));renderer.dispose();return sample.cost.cloud.progress;};
 if(await check(18.3)<.6)throw Error("No early reveal in added lead-in");await check(25);await check(18.3);await check(17.56);
 DialStore.updateValues(id,{"cloudsSlideOut.duration":.8,"cloudsSlideOut.transition":{type:"spring",stiffness:140,damping:18,mass:1}});await wait();await check(18.3);
 const s=JSON.parse(localStorage.getItem("ultimate3-voiceover-retime-settings-v4"));if(s.cost.timing.cloudSweep.duration!==.8||s.cost.timing.cloudSweep.transition.stiffness!==140)throw Error("Physics spring replaced raw duration");
 sessionStorage.setItem("edited",JSON.stringify(s));return "PASS early reveal, from/to, easing, physics, raw duration, reverse seeks and exact canvas export parity";
})()'
browser click '.micro18-nav button:has-text("16 Cost")'
browser wait 100
browser eval '(async()=>{const {DialStore,TimelineStore}=await import((await (await fetch("/src/experiments/micro-18/App.tsx")).text()).match(/from "([^"\n]*\/dialkit\.js[^"\n]*)"/)[1]);const id="ultimate3-voiceover-cost-v4";const s=JSON.parse(sessionStorage.getItem("edited"));if(DialStore.getValue(id,"cloudSweep.at")!==s.cost.timing.cloudSweep.at||DialStore.getValue(id,"cloudSweep.duration")!==.8)throw Error("Detail alias drift");TimelineStore.seek(id,.2);DialStore.updateValues(id,{"cloudSweep.from.progress":.1,"cloudSweep.to.progress":.8});return "detail endpoints edited at paused playhead"})()'
browser wait 100
browser eval '(async()=>{const s=JSON.parse(localStorage.getItem("ultimate3-voiceover-retime-settings-v4"));if(s.cost.timing.cloudSweep.from.progress!==.1||s.cost.timing.cloudSweep.to.progress!==.8)throw Error("Detail endpoint persistence failed");
 const {sampleCost}=await import("/src/experiments/micro-18/sample.ts"),{createCloudRenderer}=await import("/src/experiments/micro-09/DitherClouds.tsx"),{DITHER_DEFAULTS}=await import("/src/experiments/micro-08/dither.ts");
 const state=sampleCost(.2,s),c=document.createElement("canvas");c.width=1280;c.height=720;const image=new Image();image.src="/micro-09/image-219.png";await image.decode();const renderer=createCloudRenderer(c,image);renderer.draw(state.cloud.progress,DITHER_DEFAULTS,27+10*state.cloud.progress,state.cloud.translateY);if(c.toDataURL()!==document.querySelector(".micro18-frame > canvas.micro09-clouds").toDataURL())throw Error("Paused native detail raw preview differs from export");renderer.dispose();
 sessionStorage.setItem("edited",JSON.stringify(s));return "PASS paused detail raw physics/endpoint preview equals export canvas"})()'
browser reload
browser wait 100
browser eval '(()=>{if(localStorage.getItem("ultimate3-voiceover-retime-settings-v4")!==sessionStorage.getItem("edited"))throw Error("Authored settings changed after reload");return "PASS native detail, JSON reload and subsequent edit preservation"})()'
browser click '.micro18-settings summary'
browser click '.micro18-settings button:has-text("Export")'
browser eval '(()=>{const exported=JSON.parse(document.querySelector("textarea[aria-label=\"Ultimate 3 settings JSON\"]").value);if(JSON.stringify(exported)!==sessionStorage.getItem("edited"))throw Error("Export changed authored settings");return "PASS actual Settings JSON export parity"})()'
browser eval '(async()=>{const {DialStore}=await import((await (await fetch("/src/experiments/micro-18/App.tsx")).text()).match(/from "([^"\n]*\/dialkit\.js[^"\n]*)"/)[1]);const id="ultimate3-voiceover-main-v4",before=JSON.parse(localStorage.getItem("ultimate3-voiceover-retime-settings-v4"));DialStore.updateValue(id,"ultimate2.duration",before.allocations.ultimate2+.5);await new Promise(r=>setTimeout(r,100));const after=JSON.parse(localStorage.getItem("ultimate3-voiceover-retime-settings-v4"));if(Math.abs(after.cost.timing.cloudSweep.at-before.cost.timing.cloudSweep.at)>1e-9)throw Error("Chapter ripple detached native cloud alias");DialStore.updateValue(id,"cloudsSlideOut.duration",0);await new Promise(r=>setTimeout(r,100));if(JSON.parse(localStorage.getItem("ultimate3-voiceover-retime-settings-v4")).cost.timing.cloudSweep.duration!==.05)throw Error("50ms minimum missing");return "PASS chapter ripple and native 50ms minimum"})()'
echo "PASS Cost cloud browser evidence: $work"
