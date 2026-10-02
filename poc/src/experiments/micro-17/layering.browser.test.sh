#!/usr/bin/env bash
# Existing :5180 preview only. Installed Chrome; no server, download or persistence edits.
set -euo pipefail
OUT=${OUT:-/tmp/ultimate2-verification}
SESSION=${SESSION:-ultimate2-worker}
URL=${URL:-http://localhost:5180}
mkdir -p "$OUT"
browser() { agent-browser --session "$SESSION" --executable-path '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' "$@"; }
open_time() {
 browser open "$URL/?experiment=micro-17&time=$1" >/dev/null
 browser wait --fn 'document.fonts.check("24px Micro17Mono") && [...document.querySelectorAll("canvas")].every(e=>e.dataset.ready==="true")' >/dev/null
}
fixed_stage() {
 browser eval 'document.head.insertAdjacentHTML("beforeend", `<style>.dialkit-root,.experiment-picker{visibility:hidden!important}.micro17-app{inset:0 0 auto!important;height:720px!important}.micro17-stage{width:1280px!important;height:720px!important}</style>`)' >/dev/null
}
max_difference() {
 local crop=$1 a=$2 b=$3
 magick "$a" -crop "$crop" +repage "$OUT/crop-a.png"
 magick "$b" -crop "$crop" +repage "$OUT/crop-b.png"
 magick "$OUT/crop-a.png" "$OUT/crop-b.png" -compose difference -composite -format '%[fx:maxima*255]' info:
}
open_time 3.5
trap 'browser reload >/dev/null 2>&1 || true' EXIT
browser set viewport 1280 1100 >/dev/null
browser wait 100 >/dev/null
browser eval 'const s=document.querySelector(".micro17-stage").getBoundingClientRect(),d=document.querySelector(".dialkit-timeline").getBoundingClientRect();if(d.top-s.bottom<5.99)throw Error("Timeline overlaps preview");({clearance:d.top-s.bottom})'
browser eval 'document.querySelector(".dialkit-timeline").style.height="500px"' >/dev/null
browser wait 100 >/dev/null
browser eval 'const s=document.querySelector(".micro17-stage").getBoundingClientRect(),d=document.querySelector(".dialkit-timeline").getBoundingClientRect();if(d.top-s.bottom<5.99)throw Error("ResizeObserver failed");({resizedClearance:d.top-s.bottom})'
browser set viewport 1440 1000 >/dev/null
browser wait 100 >/dev/null
browser eval 'const s=document.querySelector(".micro17-stage").getBoundingClientRect(),d=document.querySelector(".dialkit-timeline").getBoundingClientRect();if(d.top-s.bottom<5.99)throw Error("Window resize failed");({windowResizedClearance:d.top-s.bottom})'
browser set viewport 1280 1100 >/dev/null
fixed_stage
browser eval 'const names=["grid","opening-back","smoke","trace","opening-front","warning-marker"];const layers=names.map(name=>({name,z:Number(getComputedStyle(document.querySelector(".micro17-world-layers>.micro17-"+name)).zIndex)}));if(layers.some((l,i)=>l.z!==i))throw Error("Incorrect computed stacking: "+JSON.stringify(layers));layers'
browser screenshot "$OUT/with-smoke-page.png" >/dev/null
browser eval 'document.querySelector(".micro17-smoke").style.visibility="hidden"' >/dev/null
browser screenshot "$OUT/without-smoke-page.png" >/dev/null
for spec in 'agent:40x20+620+313' 'trace:40x20+560+310' 'icon:50x20+490+310'; do
 name=${spec%%:*}; crop=${spec#*:}
 difference=$(max_difference "$crop" "$OUT/with-smoke-page.png" "$OUT/without-smoke-page.png")
 printf '%s foreground difference: %s/255 (limit 1/255 GPU rounding)\n' "$name" "$difference"
 awk -v d="$difference" 'BEGIN {exit !(d<=1.001)}'
done
if magick compare -metric AE "$OUT/with-smoke-page.png" "$OUT/without-smoke-page.png" null: 2>"$OUT/smoke-difference.txt"; then
 echo 'Invisible smoke fixture' >&2; exit 1
fi
open_time 12.25; fixed_stage
browser eval 'const p=document.querySelector("[data-block=tail-later-thinking-blue] foreignObject"),r=p.getBoundingClientRect();const inset=parseFloat(getComputedStyle(p).clipPath.match(/[\d.]+/)[0]);if(!(inset>0&&inset<120))throw Error("Missing partial paper clip");({paperViewport:r.toJSON(),inset})'
browser screenshot "$OUT/papers-page.png" >/dev/null
browser eval 'document.querySelectorAll(".micro17-paper").forEach(e=>e.style.visibility="hidden")' >/dev/null
browser screenshot "$OUT/without-papers-page.png" >/dev/null
for spec in 'header:340x40+470+310' 'neighbor:90x90+835+310'; do
 name=${spec%%:*}; crop=${spec#*:}
 difference=$(max_difference "$crop" "$OUT/papers-page.png" "$OUT/without-papers-page.png")
 printf '%s paper occlusion difference: %s/255\n' "$name" "$difference"
 awk -v d="$difference" 'BEGIN {exit !(d<=1.001)}'
done
if magick compare -metric AE "$OUT/papers-page.png" "$OUT/without-papers-page.png" null: 2>"$OUT/paper-difference.txt"; then
 echo 'Invisible paper fixture' >&2; exit 1
fi
open_time 9.218181818; fixed_stage
browser eval 'const w=document.querySelector(".micro17-warning-marker image").getBoundingClientRect();if(Math.abs(w.x+w.width/2-820)>.01||Math.abs(w.y+w.height/2-180)>.01)throw Error("Warning not at upper-right door");({warning:w.toJSON(),highlights:document.querySelectorAll(".micro17-highlight").length})'
for time in 17.818181818 100000; do
 open_time "$time"; fixed_stage
 browser eval 'if(document.querySelector(".micro09-title"))throw Error("Unexpected Signals");if(Math.abs(Number(document.querySelector(".micro17-app").dataset.time)-17.818181818)>.000001)throw Error("End not clamped")' >/dev/null
 browser screenshot "$OUT/seek-$time-page.png" >/dev/null
 magick "$OUT/seek-$time-page.png" -crop 1280x720+0+0 +repage "$OUT/seek-$time.png"
done
magick compare -metric AE "$OUT/seek-17.818181818.png" "$OUT/seek-100000.png" null:
browser errors
printf '\nPASS: computed layering + nonvacuous foreground pixels, partial paper occlusion, resize clearance, exact warning asset placement, permanent far-seek cover.\n'
