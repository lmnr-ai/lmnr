#!/usr/bin/env bash
set -euo pipefail
session="ultimate-flow-comparison-$$"
url="${EDITOR_URL:-http://localhost:5180/}"
work="$(mktemp -d "${TMPDIR:-/tmp}/ultimate-flow-comparison.XXXXXX")"
browser(){ agent-browser --session "$session" "$@"; }
trap 'browser close >/dev/null 2>&1 || true' EXIT
browser --executable-path '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' open "$url?experiment=micro-18&time=42"
browser set viewport 1280 720
pose(){
  # Reference poses were authored on v9. v11 shifts this whole chapter 6.43s earlier.
  local current_time
  current_time=$(python3 -c "print(float('$1') - 6.43)")
  browser open "$url?experiment=micro-18&time=$current_time"
  browser wait '.micro18-authored'
  browser eval '(async()=>{await document.fonts.ready;const style=document.createElement("style");style.textContent=".micro18-authored{position:fixed!important;left:0!important;top:0!important;transform:none!important}.micro18-toolbar,.experiment-picker,[data-voiceover-caption],.dialkit-root{visibility:hidden!important}.micro18-stage{position:static!important;overflow:visible!important}.micro18-app{inset:0!important}";document.head.append(style);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return "pose ready"})()'
  browser screenshot "$work/$2.png"
  ffmpeg -v error -i "$work/$2.png" -pix_fmt rgb24 -f rawvideo "$work/$2.rgb"
}
# Default comparison: inspect both renderer cuts, dense geometry and settled return.
for time in 43.729999 43.730001 46.499999 46.500001 47.759999 47.760001 42 49.5 52; do pose "$time" "new-$time"; done
pose 46 'dense'
browser eval '(()=>{const scene=document.querySelector(".micro18-flow-comparison");if(!scene)throw Error("No comparison");if(scene.querySelectorAll("[data-dot]").length!==756)throw Error("Wrong trace count");const p=document.querySelector(".micro18-shared-scene > .micro23-grid pattern path");if(p.getAttribute("stroke")!=="#1f1f1f"||Number(p.getAttribute("stroke-width"))!==.5)throw Error("Dense grid mismatch");if(scene.querySelector("[data-number=flow] span").textContent!=="756")throw Error("Comparison not settled during phrase");return "PASS dense comparison"})()'
# Explicit legacy JSON remains literal; compare untouched artwork before and after.
browser eval '(async()=>{const {VOICEOVER_SETTINGS_ID:id,VOICEOVER_DEFAULTS}=await import("/src/experiments/micro-18/voiceover-cut.ts");const s=JSON.parse(localStorage.getItem(id))??structuredClone(VOICEOVER_DEFAULTS);s.flow.comparison=false;localStorage.setItem(id,JSON.stringify(s));return "legacy comparison disabled"})()'
for time in 42 49.5 52; do pose "$time" "old-$time"; done
python3 - "$work" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
pairs=[('new-43.729999','new-43.730001'),('new-46.499999','new-46.500001'),('new-47.759999','new-47.760001')]+[(f'new-{t}',f'old-{t}') for t in ['42','49.5','52']]
for l,r in pairs:
 a=(p/f'{l}.rgb').read_bytes();b=(p/f'{r}.rgb').read_bytes()
 assert len(a)==len(b)==1280*720*3
 count=sum(a[i:i+3]!=b[i:i+3] for i in range(0,len(a),3))
 print(l,r,'changed pixels:',count)
 # Across the two-microsecond final cut, the engine activation is still
 # animating: a few shadow pixels may cross an 8-bit rounding boundary.
 # Engine paint-layer rounding also permits only one channel-level of drift,
 # bounded to fewer than .01% of pixels; all other artwork is exact.
 tolerance=64 if l in ['new-47.759999','new-49.5'] else 0
 if l=='new-46.499999':
  # Switching the equivalent CSS registration can change a handful of Skia
  # circle-edge samples. Grid, cards, text and all non-edge pixels stay exact.
  import math
  changed=[i//3 for i in range(0,len(a),3) if a[i:i+3]!=b[i:i+3]]
  def dot_edge(i):
   x,y=i%1280+.5,i//1280+.5
   cx=190+20*round((x-190)/20);cy=180+20*round((y-180)/20)
   return 190<=cx<=1010 and 180<=cy<=520 and 2.5<=math.hypot(x-cx,y-cy)<=3.5
  assert count<=12 and all(dot_edge(i) for i in changed) and max(abs(x-y) for x,y in zip(a,b))<=20,f'{l}/{r}: non-edge handoff change'
 else:
  assert count<=tolerance and max(abs(x-y) for x,y in zip(a,b))<=(1 if tolerance else 0),f'{l}/{r}: {count} pixels differ'
print('PASS renderer cuts and preserved intelligence/engine/Issues artwork:',p)
PY
# A legacy saved preset must survive upgrading this same native Flow panel.
browser open "$url?experiment=micro-18"
browser wait '.micro18-nav'
browser click '.micro18-nav button:has-text("Introducing flow-1")'
browser eval '(async()=>{
 const app=await(await fetch("/src/experiments/micro-18/App.tsx")).text();const {DialStore}=await import(app.match(/from "([^"\n]*\/dialkit\.js[^"\n]*)"/)[1]);
 const panel=DialStore.getPanels("timeline").find(p=>p.id.endsWith("-source21"));if(!panel)throw Error("No native Flow panel");
 DialStore.updateValue(panel.id,"beadsEntry.at",4.5);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 const preset=DialStore.savePreset(panel.id,"Legacy timing proof");sessionStorage.setItem("proofPreset",preset);
 const {VOICEOVER_SETTINGS_ID:id}=await import("/src/experiments/micro-18/voiceover-cut.ts");const s=JSON.parse(localStorage.getItem(id));delete s.flow.comparison;localStorage.setItem(id,JSON.stringify(s));
 return "legacy named preset saved";
})()'
browser open "$url?experiment=micro-18"
browser wait '.micro18-nav'
browser click '.micro18-nav button:has-text("Introducing flow-1")'
browser eval '(async()=>{
 const app=await(await fetch("/src/experiments/micro-18/App.tsx")).text();const {DialStore,TimelineStore}=await import(app.match(/from "([^"\n]*\/dialkit\.js[^"\n]*)"/)[1]);
 const panel=DialStore.getPanels("timeline").find(p=>p.id.endsWith("-source21"));if(!DialStore.getPresets(panel.id).some(p=>p.id===sessionStorage.getItem("proofPreset")))throw Error("Legacy preset lost");
 if(Math.abs(Number(DialStore.getValue(panel.id,"beadsEntry.at"))-4.5)>.000001)throw Error("Legacy timing reset");
 if(!TimelineStore.getTimeline(panel.id).clips.some(c=>c.key==="comparison_gridShrink"))throw Error("Missing native comparison bars");
 if(TimelineStore.getTimeline(panel.id).clips.some(c=>c.key==="graphSpread"))throw Error("Obsolete graph bar retained");
 TimelineStore.seek(panel.id,45-34.86);
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 DialStore.updateValues(panel.id,{"comparison_gptNumber.at":12,"comparison_flowNumber.from.progress":.25,"comparison_flowNumber.to.progress":.75});
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 if(getComputedStyle(document.querySelector("[data-number=gpt]")).visibility!=="hidden")throw Error("Native mask timing ignored");
 if(document.querySelector("[data-number=flow] span").textContent!=="189")throw Error("Native from endpoint ignored");
 const preset=DialStore.savePreset(panel.id,"Comparison proof");DialStore.clearActivePreset(panel.id);DialStore.updateValue(panel.id,"comparison_flowNumber.from.progress",.6);DialStore.loadPreset(panel.id,preset);
 if(DialStore.getValue(panel.id,"comparison_flowNumber.from.progress")!==.25)throw Error("New preset lost endpoint");
 return "PASS migrated preset, native bars, mask timing and from/to preset";
})()'
echo "Browser evidence: $work"
