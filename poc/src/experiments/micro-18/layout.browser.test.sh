#!/usr/bin/env bash
# Existing :5180 preview only. Exercises the live ResizeObserver seam without reload.
set -euo pipefail
SESSION=${SESSION:-ultimate3-layout-regression}
URL=${URL:-http://localhost:5180}
browser() { agent-browser --session "$SESSION" --executable-path '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' "$@"; }
cleanup() {
  browser eval '(()=>{for(const [key,suffix] of [["micro-animation-18-settings-v1","settings"],["micro-animation-18-conclusion-duration-v1","marker"]]){const backup=sessionStorage.getItem(`ultimate3-ending-duration-${suffix}-backup`),had=sessionStorage.getItem(`ultimate3-ending-duration-${suffix}-had`)==="true";if(had)localStorage.setItem(key,backup??"");else localStorage.removeItem(key);sessionStorage.removeItem(`ultimate3-ending-duration-${suffix}-backup`);sessionStorage.removeItem(`ultimate3-ending-duration-${suffix}-had`)}})()' >/dev/null 2>&1 || true
  browser close >/dev/null 2>&1 || true
}
trap cleanup EXIT
# Save the settings before mounting micro-18, whose storage-load migration may write.
browser open "$URL/?experiment=micro-01" >/dev/null
browser wait 250 >/dev/null
browser eval '(()=>{for(const [key,suffix] of [["micro-animation-18-settings-v1","settings"],["micro-animation-18-conclusion-duration-v1","marker"]]){const old=localStorage.getItem(key);sessionStorage.setItem(`ultimate3-ending-duration-${suffix}-had`,String(old!==null));sessionStorage.setItem(`ultimate3-ending-duration-${suffix}-backup`,old??"")}})()' >/dev/null
browser open "$URL/?experiment=micro-18" >/dev/null
browser wait 500 >/dev/null
# Exercise the storage-load-only 1s + 1s generated-default migration twice.
browser eval '(()=>{const key="micro-animation-18-settings-v1",value=JSON.parse(localStorage.getItem(key));value.allocations.conclusion=2;value.conclusion={placeholder:{at:0,duration:1},logo:{at:1,duration:1}};localStorage.setItem(key,JSON.stringify(value));localStorage.removeItem("micro-animation-18-conclusion-duration-v1");location.reload()})()' >/dev/null
browser wait 500 >/dev/null
browser eval '(()=>{const s=JSON.parse(localStorage.getItem("micro-animation-18-settings-v1"));if(s.allocations.conclusion!==4||s.conclusion.placeholder.duration!==2||s.conclusion.logo.at!==2||s.conclusion.logo.duration!==2)throw Error(`old conclusion did not migrate: ${JSON.stringify(s.conclusion)}`);const max=Number(document.querySelector("[aria-label=\"Timeline current time\"]").getAttribute("aria-valuemax"));if(Math.abs(max-54.018181818)>.0001)throw Error(`main ruler duration ${max}`);return true})()' >/dev/null
browser reload >/dev/null
browser wait 500 >/dev/null
browser eval '(()=>{const s=JSON.parse(localStorage.getItem("micro-animation-18-settings-v1"));if(s.allocations.conclusion!==4||s.conclusion.placeholder.duration!==2||s.conclusion.logo.at!==2||s.conclusion.logo.duration!==2)throw Error("conclusion migration was not idempotent");return true})()' >/dev/null
assert_layout() {
  browser eval '(()=>{const s=document.querySelector(".micro18-stage").getBoundingClientRect(),a=document.querySelector(".micro18-authored").getBoundingClientRect(),h=document.querySelector(".micro18-stage-host").getBoundingClientRect(),t=document.querySelector(".micro18-toolbar").getBoundingClientRect(),d=document.querySelector(".dialkit-timeline").getBoundingClientRect();if(Math.abs(s.width-a.width)>.1||Math.abs(s.height-a.height)>.1)throw Error(`stage/authored mismatch ${s.width}x${s.height} vs ${a.width}x${a.height}`);if(s.width>h.width+.1||s.height>h.height+.1)throw Error("stage exceeds artwork reservation");if(s.bottom>t.top+.1)throw Error("toolbar overlaps artwork");if(d.top-t.bottom<5.99)throw Error(`dock clearance ${d.top-t.bottom}`);return {stage:[s.width,s.height],host:[h.width,h.height],dockClearance:d.top-t.bottom}})()' >/dev/null
}
# Small -> large -> tall -> small, all in one document (no reload).
for size in '900 650' '1600 1000' '1100 900' '1280 720'; do
  set -- $size; browser set viewport "$1" "$2" >/dev/null; browser wait 150 >/dev/null; assert_layout
done
# A live dock height mutation must update the app reservation and retain clearance.
browser eval 'document.querySelector(".dialkit-timeline").style.height="180px"' >/dev/null
browser wait 150 >/dev/null
assert_layout
# Every detail timeline mounts while the global frame remains unchanged.
browser eval '(async()=>{const root=document.querySelector(".micro18-app"),before=root.dataset.time;for(const button of document.querySelectorAll(".micro18-nav button")){button.click();await new Promise(r=>setTimeout(r,80));if(root.dataset.time!==before)throw Error("view switch changed global frame");if(document.querySelectorAll(".dialkit-timeline").length!==1)throw Error("expected one active transport");}document.querySelector(".micro18-nav button").click();await new Promise(r=>setTimeout(r,100));return true})()' >/dev/null

# Drive the one live main transport. This deliberately does not navigate or
# remount React between samples, so retained references prove DOM persistence.
seek_main() {
  browser eval "(()=>{const e=document.querySelector('.dialkit-timeline-ruler'),r=e.getBoundingClientRect(),max=Number(document.querySelector('[aria-label=\"Timeline current time\"]').getAttribute('aria-valuemax')),x=r.x+r.width*${1}/max,y=r.y+r.height/2,down={bubbles:true,clientX:x,clientY:y,pointerId:1,pointerType:'mouse',button:0,buttons:1};e.dispatchEvent(new PointerEvent('pointerdown',down));document.dispatchEvent(new PointerEvent('pointerup',{...down,buttons:0}));return true})()" >/dev/null
  browser wait 100 >/dev/null
}
flow_start=$(browser eval 'Number(document.querySelector(".dialkit-timeline-clip[title^=\"Flow —\"]").title.match(/— ([0-9.]+)s/)[1])')
relative_time() { awk -v start="$flow_start" -v delta="$1" 'BEGIN{printf "%.6f",start+delta}'; }
seek_main "$(relative_time -13.7)"
browser eval '(()=>{const world=document.querySelector(".micro18-shared-world"),grid=document.querySelector(".micro18-shared-grid");if(!world||!grid)throw Error("shared world missing in Cost");window.__micro18World=world;window.__micro18Grid=grid;const subtitles=[...document.querySelectorAll(".micro16-subtitle")];if(subtitles.length!==4||Math.max(...subtitles.map(node=>Number(getComputedStyle(node).opacity)))<.99)throw Error("Cost subtitles missing or hidden");return true})()' >/dev/null
# Count pixels after applying the cloud layer's actual CSS projection, rather
# than counting its offscreen WebGL backing canvas.
cloud_screen_pixels() {
  browser eval '(async()=>{const layer=document.querySelector(".micro18-flow-cloud-layer"),source=layer?.querySelector("canvas");if(!layer||!source)throw Error("Flow cloud layer missing");const image=new Image();image.src=source.toDataURL();await image.decode();const output=document.createElement("canvas");output.width=1280;output.height=720;const context=output.getContext("2d",{willReadFrequently:true}),matrix=new DOMMatrix(getComputedStyle(layer).transform);context.setTransform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f);context.drawImage(image,0,0);const pixels=context.getImageData(0,0,1280,720).data;let count=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])count++;return count})()'
}
seek_main "$flow_start"
start_cloud_pixels=$(cloud_screen_pixels)
if [ "$start_cloud_pixels" -ne 0 ]; then echo "Flow clouds visible at bridge start: $start_cloud_pixels pixels" >&2; exit 1; fi
seek_main "$(relative_time 1.199)"
near_end_cloud_pixels=$(cloud_screen_pixels)
if [ "$near_end_cloud_pixels" -le 0 ]; then echo "Flow clouds did not enter with the shared camera" >&2; exit 1; fi
seek_main "$(relative_time 1.2)"
browser eval '(()=>{const layer=document.querySelector(".micro18-flow-cloud-layer"),m=new DOMMatrix(getComputedStyle(layer).transform);if(layer.dataset.cloudAttachment!=="screen"||Math.abs(m.a-1)>.000001||Math.abs(m.e)>.000001||Math.abs(m.f)>.000001)throw Error(`cloud handoff is not exact: ${getComputedStyle(layer).transform}`);return true})()' >/dev/null
endpoint_cloud_pixels=$(cloud_screen_pixels)
if [ "$endpoint_cloud_pixels" -le 0 ]; then echo "Flow clouds missing at bridge endpoint" >&2; exit 1; fi
for time in "$(relative_time -.01)" "$flow_start" "$(relative_time .6)" "$(relative_time 1.2)" "$(relative_time 3.3)" "$(relative_time 9.3)" "$(relative_time .6)" "$(relative_time -13.7)"; do
  seek_main "$time"
  browser eval '(()=>{const worlds=document.querySelectorAll(".micro18-shared-world"),grids=document.querySelectorAll(".micro18-shared-grid"),camera=document.querySelectorAll("[data-shared-camera=true]");if(worlds.length!==1||grids.length!==1||camera.length!==1)throw Error(`expected one world/grid/camera, got ${worlds.length}/${grids.length}/${camera.length}`);if(worlds[0]!==window.__micro18World||grids[0]!==window.__micro18Grid)throw Error("shared world or grid remounted");const cost=document.querySelector(".micro18-cost-space"),flow=document.querySelector(".micro18-flow-content"),costMatrix=new DOMMatrix(getComputedStyle(cost).transform),flowMatrix=new DOMMatrix(getComputedStyle(flow).transform),close=(a,b)=>Math.abs(a-b)<.001;if(!close(costMatrix.a,5/6)||!close(costMatrix.e,16.25)||!close(costMatrix.f,-50.4166666667))throw Error(`Cost placement changed: ${cost.style.transform}`);if(!close(flowMatrix.a,1)||!close(flowMatrix.e,0)||!close(flowMatrix.f,4800))throw Error(`Flow placement changed: ${flow.style.transform}`);for(const node of [document.querySelector(".micro18-shared-scene"),worlds[0],cost,flow])if(getComputedStyle(node).overflowX==="hidden"||getComputedStyle(node).overflowY==="hidden")throw Error(`unexpected chapter clip on ${node.className}`);if(getComputedStyle(document.querySelector(".micro18-frame")).overflow!=="hidden")throw Error("outer frame must clip");return true})()' >/dev/null
done

# Other scene kinds still honor the authored wrapper contract in inspection mode.
for time in "$(relative_time 13.5)" "$(relative_time 19.5)" "$(relative_time 20.5)"; do
  browser open "$URL/?experiment=micro-18&time=$time" >/dev/null
  browser wait 250 >/dev/null
  browser eval '(()=>{const s=document.querySelector(".micro18-stage").getBoundingClientRect(),a=document.querySelector(".micro18-authored").getBoundingClientRect();if(Math.abs(s.width-a.width)>.1||Math.abs(s.height-a.height)>.1)throw Error("inspection framing mismatch");return true})()' >/dev/null
done
# The two conclusion captions follow the card cut at 55.2s and the logo holds.
for check in '53.7|Unlock the insights hiding in millions of agent traces' '54.7|Unlock the insights hiding in millions of agent traces' '55.7|With Laminar' '56.7|With Laminar'; do
  time=${check%%|*}; caption=${check#*|}
  browser open "$URL/?experiment=micro-18&time=$time" >/dev/null
  browser wait 250 >/dev/null
  browser eval "(()=>{const caption=document.querySelector('.micro18-conclusion-subtitle')?.textContent;if(caption!=='$caption')throw Error('wrong conclusion caption at $time: '+caption);return true})()" >/dev/null
done
browser errors
printf 'PASS: 54.018s ruler, idempotent stored-default migration, conclusion captions, live resize, dock resize, detail mounts, persistent world identity, projected Flow-cloud seam (%s -> %s -> %s pixels), clipping, and all scene kinds.\n' "$start_cloud_pixels" "$near_end_cloud_pixels" "$endpoint_cloud_pixels"
