#!/usr/bin/env bash
# Existing editor + installed Chrome. Keep uniquely owned screenshots for inspection.
set -euo pipefail
session="micro23-return-grid-$$"
url="${MICRO23_EDITOR_URL:-http://localhost:5180/}"
chrome="${CHROME_EXECUTABLE:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
work="$(mktemp -d "${TMPDIR:-/tmp}/micro23-return.XXXXXX")"
browser() { agent-browser --session "$session" "$@"; }
trap 'browser close >/dev/null 2>&1 || true' EXIT
browser --executable-path "$chrome" open "${url}?experiment=micro-23&time=0"
browser set viewport 1312 824
for state in opening dense ending; do
  if [[ "$state" == dense ]]; then browser open "${url}?experiment=micro-23&time=3"; fi
  if [[ "$state" == ending ]]; then browser open "${url}?experiment=micro-23&time=6"; fi
  browser wait '.micro23-scene'
  browser eval '(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const scene = document.querySelector(".micro23-scene"), rect = scene.getBoundingClientRect();
    if (rect.x !== 16 || rect.y !== 48 || rect.width !== 1280 || rect.height !== 720) throw new Error("Incorrect raster fixture bounds");
    const dense = Number(scene.dataset.time) === 3;
    if (Number(scene.dataset.cellSize) !== (dense ? 20 : 60)) throw new Error("Unexpected grid size");
    const stroke = () => scene.querySelector("pattern path").getAttribute("stroke");
    if (stroke() !== (dense ? "#1f1f1f" : "#333333")) throw new Error("Incorrect zoom-dependent grid color");
    if (Number(scene.dataset.time) > 4) {
      for (const el of scene.querySelectorAll(".micro23-headline,.micro23-label-box,.micro23-number,.micro23-dots circle")) {
        if (el.getBoundingClientRect().bottom >= rect.top) throw new Error("Content remains in the final viewport");
      }
      for (const dot of scene.querySelectorAll(".micro23-dots circle")) {
        if (dot.getAttribute("opacity") !== "1") throw new Error("Return must move dots offscreen, not fade them");
      }
    }
    const source = await (await fetch("/src/experiments/micro-23/App.tsx")).text();
    const sdk = await import(source.match(/from "([^"\n]*\/dialkit\.js[^"\n]*)"/)[1]);
    const {MICRO_23_TIMELINE, MICRO_23_TIMELINE_ID, MICRO_23_CONTROLS_ID} = await import("/src/experiments/micro-23/timeline.ts");
    for (const [key, clip] of Object.entries(MICRO_23_TIMELINE)) {
      for (const [field, expected] of Object.entries({at: clip.at, duration: clip.duration, "from.progress": 0, "to.progress": 1, transition: clip.transition})) {
        if (JSON.stringify(sdk.DialStore.getValue(MICRO_23_TIMELINE_ID, `${key}.${field}`)) !== JSON.stringify(expected)) throw new Error(`Native default mismatch: ${key}.${field}`);
      }
    }
    if (dense) {
      sdk.DialStore.updateValue(MICRO_23_CONTROLS_ID, "gridColor", "#445566");
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (stroke() !== "#445566") throw new Error("Existing Grid Color dial does not control dense grid");
      sdk.DialStore.updateValue(MICRO_23_CONTROLS_ID, "gridColor", "#1f1f1f");
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    return "PASS: native defaults, zoom-dependent grid color, existing dial and offscreen ending geometry";
  })()'
  browser screenshot "$work/$state.png"
  ffmpeg -v error -i "$work/$state.png" -vf crop=1280:720:16:48 -pix_fmt rgb24 -f rawvideo "$work/$state.rgb"
done
python3 - "$work" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1])
a, b = (root / 'opening.rgb').read_bytes(), (root / 'ending.rgb').read_bytes()
assert len(a) == len(b) == 1280 * 720 * 3
changed = sum(a[i:i+3] != b[i:i+3] for i in range(0, len(a), 3))
assert changed == 0, f'{changed} artwork pixels differ between opening and empty-grid ending'
print(f'PASS: opening and ending match exactly (zero changed pixels). Evidence: {root}')
PY
