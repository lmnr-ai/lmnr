import assert from "node:assert/strict";

globalThis.window = {};
await import("../studies/timings.generated.js");
await import("../studies/animation-10.js");

const study = window.ANIMATION_SOUNDTRACK_STUDIES.find(item => item.id === "animation-10");
assert(study, "Animation 10 study must exist");

for (const version of study.versions) {
  const layer = version.layers.find(item => item.name === "Cloud emissions");
  assert(layer, `${version.id}: cloud-emission layer must exist`);
  assert.equal(layer.events.length, window.SOUNDTRACK_TIMINGS.animation10.puffs.length, `${version.id}: every authored cloud emission must have a cue`);
  assert(layer.events.every(event => event.kind === "puff"), `${version.id}: cloud cues must use the puff voice`);
  assert(
    layer.events.every(event => event.gain >= 0.02),
    `${version.id}: cloud puffs must remain audible above the harmonic bed (minimum gain 0.02)`,
  );
}

console.log("Animation 10 cloud emissions are complete and audibly mixed.");
