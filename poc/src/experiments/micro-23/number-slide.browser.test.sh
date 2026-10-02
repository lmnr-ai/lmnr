#!/usr/bin/env bash
# Number entrances now fold down; retained script path replaces the old horizontal-slide regression.
# Uses an isolated browser session and the existing editor; never starts a server.
set -euo pipefail
session="micro23-number-fold-$$"
url="${MICRO23_EDITOR_URL:-http://localhost:5180/}"
chrome="${CHROME_EXECUTABLE:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
browser() { agent-browser --session "$session" "$@"; }
trap 'browser close >/dev/null 2>&1 || true' EXIT
browser --executable-path "$chrome" open "${url}?experiment=micro-23"
browser wait '.micro23-scene'
browser eval '(async () => {
  const source = await (await fetch("/src/experiments/micro-23/App.tsx")).text();
  const sdk = await import(source.match(/from "([^"\n]*\/dialkit\.js[^"\n]*)"/)[1]);
  const id = "micro-animation-23-timeline-v1";
  const assert = (ok, message) => {if (!ok) throw new Error(message);};
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  sdk.TimelineStore.pause(id);
  // Freeze the separately animated world so this test isolates fixed frame vs card motion.
  sdk.DialStore.updateValues(id, {"gridShrink.from.progress": 1, "gridShrink.to.progress": 1, "returnToGrid.at": 100});
  await frame();
  await document.fonts.ready;
  for (const [model, target] of [["gpt", 38], ["flow", 888]]) {
    const key = `${model}Number`;
    // Timeline metadata contains paths, not resolved timing values.
    const clip = {at: sdk.DialStore.getValue(id, `${key}.at`), duration: sdk.DialStore.getValue(id, `${key}.duration`)};
    assert(Number.isFinite(clip.at) && Number.isFinite(clip.duration), "Fixture needs resolved clip times");
    // Linear fixture gives exact quarter/half poses while preserving original start/duration.
    sdk.DialStore.updateValue(id, `${key}.transition`, {type: "easing", duration: clip.duration, ease: [0, 0, 1, 1]});
    const box = document.querySelector(`[data-number="${model}"]`);
    const card = box.querySelector(".flow1-slide"), border = box.querySelector(".micro23-number-border");
    assert(box.classList.contains("micro23-fold-frame"), "Number must use the headline frame structure");
    assert(getComputedStyle(box).overflow === "hidden", "Frame must clip the folding card");
    assert(border.parentElement === box && !card.contains(border), "Border must be outside moving card");
    assert(border.querySelector("[data-frame-stroke]").getAttribute("stroke-width") === "0.5", "Border must be 0.5px");
    assert(getComputedStyle(card).backgroundColor === "rgb(26, 26, 26)", "Card must carry the background");
    let fixed = null;
    for (const fraction of [-.01, 0, .25, .5, 1, .25, -.01]) {
      sdk.TimelineStore.seek(id, clip.at + clip.duration * fraction); await frame();
      const visible = fraction >= 0, p = Math.max(0, fraction);
      assert((getComputedStyle(border).visibility === "visible") === visible, `${model}: frame visibility must be instant; fraction=${fraction}, time=${document.querySelector(".micro23-scene").dataset.time}, at=${clip.at}, authoredAt=${sdk.DialStore.getValue(id, `${key}.at`)}, visibility=${getComputedStyle(border).visibility}`);
      const matrix = new DOMMatrixReadOnly(getComputedStyle(card).transform);
      assert(Math.abs(matrix.m42 - (p - 1) * 40) < .01 && matrix.m41 === 0, `${model}: wrong vertical fold pose`);
      assert(Math.abs(Number(card.textContent) - Math.round(target * p)) <= 1, `${model}: count must share fold progress`);
      for (const el of [box, card, border]) assert(getComputedStyle(el).opacity === "1", "Numbers must not fade");
      if (visible) {
        const bounds = border.getBoundingClientRect();
        if (!fixed) fixed = bounds;
        for (const key of ["x", "y", "width", "height"]) assert(Math.abs(bounds[key] - fixed[key]) < .1, `${model}: border moved`);
        const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y - 2);
        assert(!hit || !card.contains(hit), "Card leaked above the frame");
      }
    }
    sdk.DialStore.updateValue(id, `${key}.at`, 12);
    sdk.TimelineStore.seek(id, 11.9); await frame();
    assert(getComputedStyle(box).visibility === "hidden", "Frame appearance did not follow retime");
    sdk.TimelineStore.seek(id, 12); await frame();
    assert(getComputedStyle(box).visibility === "visible", "Retimed frame must appear instantly");
  }
  return "PASS: GPT and Flow fixed 0.5px frames, clipped downward cards, count-up, no horizontal motion/fade, retimes and reverse seeks";
})()'
