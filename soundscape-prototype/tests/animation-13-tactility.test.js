import assert from "node:assert/strict";

globalThis.window = {};
await import("../studies/timings.generated.js");
await import("../studies/animation-13.js");

const study = window.ANIMATION_SOUNDTRACK_STUDIES.find(item => item.id === "animation-13");
assert(study, "Animation 13 study must exist");

for (const version of study.versions) {
  const events = version.layers.flatMap(layer => layer.events);
  const dots = events.filter(event => /^(Dot sparkle|Dot field|Final pre-exit dot)/.test(event.label));
  const sourceDots = window.SOUNDTRACK_TIMINGS.animation13.dots;
  assert.equal(dots.length, sourceDots.length, `${version.id}: every source-timed sparkle tick needs a cue`);
  assert(dots.every(event => event.kind === "pop" && event.count > 0), `${version.id}: sparkle cues must produce one audible pop per changed dot`);
  assert.equal(dots.reduce((sum, event) => sum + event.count, 0), sourceDots.reduce((sum, event) => sum + event.count, 0), `${version.id}: every deterministic dot change must be represented`);

  for (const label of ["Camera zoom-out begins", "Camera travels to benchmark", "Camera lifts into analysis", "Camera travels to engine"]) {
    const event = events.find(item => item.label === label);
    assert(event?.kind === "whoosh" && event.gain >= 0.02, `${version.id}: ${label} needs an audible full-duration whoosh`);
  }

  assert.equal(events.find(event => event.label === "Benchmark heading enters")?.kind, "whoosh", `${version.id}: Trace analysis / intelligence heading needs a sliding sound`);
  assert.equal(events.find(event => event.label === "Analysis heading enters")?.kind, "whoosh", `${version.id}: analysis heading needs a sliding sound`);
  assert.equal(events.find(event => event.label === "Flow-1 percentage counts upward")?.kind, "ratchet", `${version.id}: percentage count needs ratcheting clicks`);
  assert.equal(events.find(event => event.label === "All six counts begin together")?.kind, "ratchet", `${version.id}: analysis counts need ratcheting clicks`);
  assert.equal(events.find(event => event.label === "Engine module powers blue")?.kind, "fill", `${version.id}: blue module fill needs a rising fill sound`);
  assert.equal(events.find(event => event.label === "Cover descends over engine")?.kind, "doors", `${version.id}: closing cover needs paired door motion`);
  assert.equal(events.find(event => event.label === "Cover geometry locks")?.kind, "latch", `${version.id}: closing cover needs a final latch`);
}

console.log("Animation 13 tactile cues cover dots, camera motion, counts, blue fill, and closure.");
