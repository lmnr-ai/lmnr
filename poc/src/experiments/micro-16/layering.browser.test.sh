#!/usr/bin/env bash
# Requires the existing editor on :5180, agent-browser, installed Chrome, and ImageMagick.
# Uses its own browser session; never changes persisted DialKit values.
set -euo pipefail
OUT=${OUT:-/tmp/micro16-layer-check}
SESSION=${SESSION:-micro16-layer-regression}
URL=${URL:-http://localhost:5180/?experiment=micro-16&time=12}
mkdir -p "$OUT"
browser() { agent-browser --session "$SESSION" --executable-path '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' "$@"; }
browser open "$URL" >/dev/null
trap 'browser reload >/dev/null 2>&1 || true' EXIT
browser set viewport 1280 1100 >/dev/null
browser eval 'document.head.insertAdjacentHTML("beforeend", `<style>.dialkit-root,.experiment-picker{visibility:hidden!important}.micro16-app{inset:0 0 auto!important;height:720px!important}.micro16-stage{width:1280px!important;height:720px!important}</style>`);' >/dev/null
browser wait --fn 'document.fonts.check("24px Micro16Mono") && document.querySelectorAll("canvas[data-ready=true]").length===3' >/dev/null
browser eval 'const names=["micro16-grid","micro10-puffs","micro10-photo","micro16-world","micro16-overlay","micro09-clouds"];const layers=names.map(name=>({name,z:Number(getComputedStyle(document.querySelector(".micro16-scene > ."+name)).zIndex)})); if(layers.some((layer,i)=>layer.z!==i))throw Error("Incorrect paint order: "+JSON.stringify(layers));layers'
TRACE=$(browser eval 'const r=[...document.querySelectorAll(".micro16-world rect[fill=\"#5c5c5c\"]")].map(e=>e.getBoundingClientRect()).find(r=>r.top>=300&&r.bottom<=422&&r.right>100&&r.left<500&&r.width>=100);if(!r)throw Error("Missing visible trace fixture");"20x20+"+Math.ceil(Math.max(10,r.left+10))+"+"+Math.ceil(r.top+10)' | tr -d '"\r')
browser screenshot "$OUT/with-smoke-page.png" >/dev/null
browser eval 'document.querySelectorAll(".micro16-scene > .micro10-photo,.micro16-scene > .micro10-puffs").forEach(e=>e.style.visibility="hidden")' >/dev/null
browser screenshot "$OUT/without-smoke-page.png" >/dev/null
for spec in 'agent:40x20+620+313' 'budget:258x48+511+197' "trace:$TRACE"; do
 name=${spec%%:*}; crop=${spec#*:}
 magick "$OUT/with-smoke-page.png" -crop "$crop" +repage "$OUT/$name-with.png"
 magick "$OUT/without-smoke-page.png" -crop "$crop" +repage "$OUT/$name-without.png"
 # Hiding a GPU canvas can change Chromium's gradient rasterization by one
 # 8-bit level. Allow that rounding only, not visible smoke contamination.
 difference=$(magick "$OUT/$name-with.png" "$OUT/$name-without.png" -compose difference -composite -format '%[fx:maxima*255]' info:)
 printf '%s foreground maximum channel difference: %s/255 (limit 1/255)\n' "$name" "$difference"
 awk -v difference="$difference" 'BEGIN {exit !(difference <= 1.001)}'
done
# Check smoke actually rendered, so foreground equality cannot pass vacuously.
if magick compare -metric AE "$OUT/with-smoke-page.png" "$OUT/without-smoke-page.png" null: 2>"$OUT/smoke-difference.txt"; then
 echo 'Smoke fixture is invisible' >&2
 exit 1
fi
magick "$OUT/with-smoke-page.png" -crop 1280x720+0+0 +repage "$OUT/editor-12.png"
browser errors
