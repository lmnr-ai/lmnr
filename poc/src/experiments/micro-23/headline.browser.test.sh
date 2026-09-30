#!/usr/bin/env bash
# Uses a fresh browser session and the already-running editor; does not start servers.
set -euo pipefail
session="micro23-headline-$$"
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
  // Isolate card/frame motion from the independently authored camera and use
  // explicit entrance/exit fixtures; source defaults are checked separately.
  sdk.DialStore.updateValues(id, {
    "gridShrink.from.progress": 1, "gridShrink.to.progress": 1, "returnToGrid.at": 100,
    "headlineReveal.at": .81, "headlineReveal.duration": .5,
    "headlineFadeOut.at": 1.55, "headlineFadeOut.duration": 4.25,
  });
  await frame();
  await document.fonts.ready;
  const timeline = sdk.TimelineStore.getTimeline(id);
  assert(timeline.clips.length === 10, "Expected ten editable timeline bars");
  assert(timeline.clips.some(c => c.key === "headlineReveal"), "Missing reveal bar");
  assert(timeline.clips.some(c => c.key === "headlineFadeOut" && c.label === "Headline Slide Out"), "Missing slide-out bar label");
  const headline = document.querySelector(".micro23-headline");
  const reveal = headline.querySelector(".flow1-slide");
  const exit = headline.querySelector(".micro23-headline-exit");
  const border = headline.querySelector(".micro23-headline-border");
  assert(border.parentElement === headline && !exit.contains(border), "Border must be outside the moving card");
  assert(border.querySelector("[data-frame-stroke]").getAttribute("stroke-width") === "0.5", "Border must be 0.5px");
  assert(getComputedStyle(headline).overflow === "hidden", "Container must clip the card");
  assert(getComputedStyle(reveal).backgroundColor === "rgb(26, 26, 26)", "Moving card must own the background");
  const dots = document.querySelector(".micro23-dots"), world = dots.parentElement;
  const grid = document.querySelector(".micro23-grid");
  assert(headline.parentElement === world, "Headline and dots must share the same world");
  assert(grid.parentElement === world.parentElement, "Grid and world must share a stacking context");
  assert(Number(getComputedStyle(world).zIndex) > Number(getComputedStyle(grid).zIndex), "Text must be above grid");
  assert(Number(getComputedStyle(dots).zIndex) > Number(getComputedStyle(headline).zIndex), "Dots must be above text");
  assert(headline.textContent === "20x more traces analyzed per dollar", "Incorrect headline");
  assert(headline.style.left === "340px" && headline.style.top === "290px", "Incorrect Figma placement");
  assert(headline.style.width === "600px" && headline.style.height === "140px", "Incorrect Figma dimensions");
  assert(getComputedStyle(reveal).fontSize === "48px", "Incorrect headline font size");
  let fixedBorder = null;
  for (const [time, enterY, exitY, visible] of [[.8, -140, 0, false], [.81, -140, 0, true], [1.06, -70, 0, true], [1.4, 0, 0, true], [3.675, 0, 70, true], [6, 0, 140, true], [1.06, -70, 0, true]]) {
    sdk.TimelineStore.seek(id, time); await frame();
    const actualEnter = new DOMMatrixReadOnly(getComputedStyle(reveal).transform).m42;
    const actualExit = new DOMMatrixReadOnly(getComputedStyle(exit).transform).m42;
    assert(Math.abs(actualEnter - enterY) < .1, `Incorrect card entrance at ${time}: ${actualEnter}`);
    assert(Math.abs(actualExit - exitY) < .1, `Incorrect card exit at ${time}: ${actualExit}`);
    assert((getComputedStyle(border).visibility === "visible") === visible, `Container did not appear instantly at ${time}`);
    for (const el of [headline, exit, reveal, border]) assert(getComputedStyle(el).opacity === "1", "Card or frame must not fade");
    if (visible) {
      const bounds = border.getBoundingClientRect();
      if (!fixedBorder) fixedBorder = bounds;
      for (const key of ["x", "y", "width", "height"]) assert(Math.abs(bounds[key] - fixedBorder[key]) < .1, `Border moved at ${time}`);
    }
  }
  sdk.TimelineStore.seek(id, 6);
  sdk.DialStore.updateValue(id, "headlineFadeOut.at", 10); await frame();
  assert(new DOMMatrixReadOnly(getComputedStyle(exit).transform).m42 === 0, "Exit bar did not move independently");
  assert(Number(document.querySelector("[data-dot=\"755\"]").getAttribute("r")) === 3, "Exit edit changed blue dots");
  sdk.DialStore.updateValue(id, "blueDots.at", 10);
  sdk.DialStore.updateValue(id, "headlineFadeOut.at", 1.55); await frame();
  assert(new DOMMatrixReadOnly(getComputedStyle(exit).transform).m42 === 140, "Exit still tied to blue bar");
  assert(Number(document.querySelector("[data-dot=\"755\"]").getAttribute("r")) === 0, "Blue edit did not apply");
  assert(sdk.TimelineStore.getTimeline(id).clips.find(c => c.key === "headlineFadeOut").label === "Headline Slide Out", "Slide-out label lost after retiming");
  return "PASS: fixed instant 0.5px frame, clipped background card, downward entry/exit without fading, independent bar, layers and reverse seek";
})()'
