#!/usr/bin/env bash
# Existing editor + isolated Chrome. Verify real native controls and both grid cuts.
set -euo pipefail
session="micro24-insert-$$"; url="${MICRO24_EDITOR_URL:-http://localhost:5180/}"
chrome="${CHROME_EXECUTABLE:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
work="$(mktemp -d "${TMPDIR:-/tmp}/micro24-browser.XXXXXX")"
browser(){ agent-browser --session "$session" "$@"; }
trap 'browser close >/dev/null 2>&1 || true' EXIT
browser --executable-path "$chrome" open "$url?experiment=micro-24&time=1"
browser set viewport 1280 720
for time in 1 4.5 5.4 5.769 5.77 6.8 8.5 9.7 10.05 11 15.25; do
  browser open "$url?experiment=micro-24&time=$time"
  browser wait '.flow3-scene'
  browser eval '(async () => {
    await document.fonts.ready;
    const style=document.createElement("style");
    style.textContent=".flow3-scene{position:fixed!important;left:0!important;top:0!important;transform:none!important}.flow3-stage{position:static!important;overflow:visible!important}.flow1-subtitle-layer,.flow3-toolbar,.dialkit-timeline{visibility:hidden!important}";
    document.head.append(style);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const time=Number(new URLSearchParams(location.search).get("time")), scene=document.querySelector(".flow3-scene");
    const insert=scene.querySelector(".flow3-micro23"), active=time>=5.77&&time<10.05;
    if(!!insert!==active) throw Error("Unexpected insert visibility at "+time);
    const base=getComputedStyle(scene.querySelector(".flow1-grid")).backgroundImage;
    if(!base.includes("rgb(51, 51, 51)")) throw Error("Original grid color changed");
    if(time===4.5) {
      if(scene.querySelectorAll("[data-model]").length!==5||!scene.querySelector("[data-flow-point]")) throw Error("Retained beads/ball missing");
      for(const text of ["opus-5","sonnet-5","gpt-6 sol","gemini-3.8 flash","gpt-6 luna"]) if(!scene.textContent.includes(text)) throw Error("Missing peer label");
    }
    if(time===5.4) {
      if(!getComputedStyle(scene.querySelector(".flow3-intelligence-points")).transform.includes("-")) throw Error("Assembly must exit left");
      const heading=scene.querySelector(".flow3-heading-intelligence");
      if(heading.style.transform) throw Error("Title frame must remain stationary");
    }
    if(insert) {
      const path=insert.querySelector("pattern path"), dense=time===6.8||time===8.5;
      if(path.getAttribute("stroke")!==(dense?"#1f1f1f":"#333333")) throw Error("Wrong insert grid color");
      if(Number(path.getAttribute("stroke-width"))!==(dense?.5:1)) throw Error("Wrong insert grid width");
      if(insert.querySelectorAll("[data-dot]").length!==888) throw Error("Missing traces");
      if(time===9.7) for(const el of insert.querySelectorAll(".micro23-headline,.micro23-label-box,.micro23-number,.micro23-dots circle")) if(el.getBoundingClientRect().bottom>=0) throw Error("Return is not empty");
    }
    return "PASS pose "+time;
  })()'
  case "$time" in 5.769|5.77|9.7|10.05)
    browser screenshot "$work/$time.png"
    ffmpeg -v error -i "$work/$time.png" -pix_fmt rgb24 -f rawvideo "$work/$time.rgb";;
  esac
done
python3 - "$work" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
for left,right in [('5.769','5.77'),('9.7','10.05')]:
    a=(p/f'{left}.rgb').read_bytes(); b=(p/f'{right}.rgb').read_bytes()
    assert len(a)==len(b)==1280*720*3
    changed=sum(a[i:i+3]!=b[i:i+3] for i in range(0,len(a),3))
    assert changed==0, f'{left}/{right}: {changed} seam pixels differ'
    print(f'PASS: {left}/{right} zero differing pixels')
print(f'Raster evidence: {p}')
PY
# Actual DialKit edit, static preview uses the same native edited clip values.
browser open "$url?experiment=micro-24&time=6.8"
browser wait '.flow3-scene'
browser eval '(async()=>{
  const source=await(await fetch("/src/experiments/micro-24/App.tsx")).text();
  const sdk=await import(source.match(/from "([^"\n]*\/dialkit\.js[^"\n]*)"/)[1]);
  const {FLOW_3_TIMELINE_ID:id}=await import("/src/experiments/micro-24/timeline.ts");
  sdk.DialStore.updateValues(id,{"micro23HeadlineReveal.at":9,"micro23GptNumber.at":9,"micro23FlowNumber.from.progress":.25,"micro23FlowNumber.to.progress":.75});
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  if(getComputedStyle(document.querySelector(".micro23-headline")).visibility!=="hidden") throw Error("Retimed title mask visible too early");
  if(getComputedStyle(document.querySelector("[data-number=gpt]")).visibility!=="hidden") throw Error("Retimed number mask visible too early");
  if(document.querySelector("[data-number=flow] span").textContent!=="222") throw Error("Native from value not sampled");
  return "PASS native timing and from/to editing";
})()'
browser open "$url?experiment=micro-24"
browser wait '.flow3-scene'
browser wait --fn '(()=>{const s=document.querySelector(".flow3-scene")?.getBoundingClientRect(),d=document.querySelector(".dialkit-timeline")?.getBoundingClientRect();return s&&d&&s.bottom<=d.top-5.9})()'
echo 'PASS: live native timeline and 6px dock clearance'
