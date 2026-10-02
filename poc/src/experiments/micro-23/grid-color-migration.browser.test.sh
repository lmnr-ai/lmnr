#!/usr/bin/env bash
set -euo pipefail
session="micro23-color-migration-$$"
url="${MICRO23_EDITOR_URL:-http://localhost:5180/}?experiment=micro-23&time=3"
chrome="${CHROME_EXECUTABLE:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
browser() { agent-browser --session "$session" "$@"; }
trap 'browser close >/dev/null 2>&1 || true' EXIT
browser --executable-path "$chrome" open "$url"
for color in '#333333' '#292929'; do
  browser wait '.micro23-scene'
  # Seed real persisted old defaults only in this isolated browser profile.
  browser eval "window.__oldGridColor = '$color'"
  browser eval '(async () => {
    const source = await (await fetch("/src/experiments/micro-23/App.tsx")).text();
    const sdk = await import(source.match(/from "([^"\n]*\/dialkit\.js[^"\n]*)"/)[1]);
    const {MICRO_23_CONTROLS_ID} = await import("/src/experiments/micro-23/timeline.ts");
    sdk.DialStore.updateValues(MICRO_23_CONTROLS_ID, {gridColor: window.__oldGridColor, dotDiameter: 8});
    localStorage.removeItem("micro23:dense-grid-1f-v1");
    return "Seeded persisted old grid default";
  })()'
  browser open "$url"
  browser wait --fn 'document.querySelector(".micro23-grid pattern path")?.getAttribute("stroke") === "#1f1f1f"'
  browser eval '(async () => {
    const source = await (await fetch("/src/experiments/micro-23/App.tsx")).text();
    const sdk = await import(source.match(/from "([^"\n]*\/dialkit\.js[^"\n]*)"/)[1]);
    const {MICRO_23_CONTROLS_ID} = await import("/src/experiments/micro-23/timeline.ts");
    if (sdk.DialStore.getValue(MICRO_23_CONTROLS_ID, "gridColor") !== "#1f1f1f") throw new Error("Dial remains stale");
    if (sdk.DialStore.getValue(MICRO_23_CONTROLS_ID, "dotDiameter") !== 8) throw new Error("Unrelated appearance changed");
    if (!JSON.parse(localStorage.getItem("micro23:dense-grid-1f-v1")).applied) throw new Error("Migration was not recorded");
    return "PASS: persisted old default upgraded in both dial and artwork, other controls retained";
  })()'
done
