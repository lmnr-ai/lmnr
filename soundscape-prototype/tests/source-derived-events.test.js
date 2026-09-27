import assert from "node:assert/strict";

globalThis.window = {};
await import("../studies/timings.generated.js");
await import("../studies/animation-10.js");
await import("../studies/animation-13.js");
await import("../studies/animation-15.js");

const studies = Object.fromEntries(window.ANIMATION_SOUNDTRACK_STUDIES.map(study => [study.id, study]));
const allEvents = version => version.layers.flatMap(layer => layer.events);
const near = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-6, `${message}: expected ${expected}, received ${actual}`);

for (const version of studies["animation-10"].versions) {
  const events = allEvents(version);
  for (const source of window.SOUNDTRACK_TIMINGS.animation10.entrances) {
    const event = events.find(item => item.label === `${source.name} enters at agent` && Math.abs(item.time - source.time) < 1e-6);
    assert(event, `${version.id}: missing source-derived ${source.name} entrance at ${source.time}`);
  }
  for (const source of window.SOUNDTRACK_TIMINGS.animation10.exits) {
    const event = events.find(item => item.label === `${source.name} exits left edge` && Math.abs(item.time - source.time) < 1e-6);
    assert(event, `${version.id}: missing source-derived ${source.name} exit at ${source.time}`);
  }
  for (const [index, source] of window.SOUNDTRACK_TIMINGS.animation10.puffs.entries()) {
    near(events.find(item => item.label === `Cloud reaches maximum; puff ${index + 1} emits`)?.time, source.time, `${version.id}: puff ${index + 1}`);
  }
  for (const source of window.SOUNDTRACK_TIMINGS.animation10.spinner) {
    near(events.find(item => item.label === `Spinner completes turn ${source.turn}`)?.time, source.time, `${version.id}: spinner turn ${source.turn}`);
  }
}

const animation13Labels = {
  cloudReveal: "Clouds begin revealing Flow-1",
  cloudExit: "Clouds begin exiting downward",
  cameraZoom: "Camera zoom-out begins",
  cameraToBenchmark: "Camera travels to benchmark",
  dotsExit: "Dots begin contracting away",
  benchmarkHeading: "Benchmark heading enters",
  modelRows: "Six model rows enter together",
  percentageReveal: "Six percentages enter together",
  percentageCountUp: "Flow-1 percentage counts upward",
  cameraToAnalysis: "Camera lifts into analysis",
  numberSwap: "All percentages swap to counts",
  analysisCountUp: "All six counts begin together",
  barsGrow: "All six bars begin growing together",
  analysisHeading: "Analysis heading enters",
  cameraToEngine: "Camera travels to engine",
  moduleActivation: "Engine module powers blue",
  engineSpinner: "Engine spinner begins",
  engineLines: "Engine lines begin continuous upward travel",
  coverDescent: "Cover descends over engine",
  coverTint: "Cover tint and loader crossfade begin",
  coverSpinner: "Cover spinner begins",
};
for (const version of studies["animation-13"].versions) {
  const events = allEvents(version);
  for (const [key, label] of Object.entries(animation13Labels)) {
    const event = events.find(item => item.label === label);
    const source = window.SOUNDTRACK_TIMINGS.animation13.clips[key];
    near(event?.time, source.time, `${version.id}: ${label} start`);
    if (!["engineSpinner", "engineLines", "coverSpinner"].includes(key)) near(event?.duration, source.duration, `${version.id}: ${label} duration`);
  }
  assert.equal(events.filter(event => event.label.startsWith("Cover spinner wrap ")).length, window.SOUNDTRACK_TIMINGS.animation13.coverSpinnerWraps.length, `${version.id}: every cover-spinner wrap must be cued`);
  assert.equal(events.filter(event => event.label.startsWith("Engine spinner wrap ")).length, window.SOUNDTRACK_TIMINGS.animation13.engineSpinnerWraps.length, `${version.id}: every engine-spinner wrap must be cued`);
  assert.equal(events.filter(event => event.label.startsWith("Engine line wrap ")).length, window.SOUNDTRACK_TIMINGS.animation13.engineLineWraps.length, `${version.id}: every engine-line wrap must be cued`);
}

for (const version of studies["animation-15"].versions) {
  const events = allEvents(version);
  const source = window.SOUNDTRACK_TIMINGS.animation15;
  assert.equal(events.filter(event => /cell-\d+ warning appears/.test(event.label)).length, source.appearances.length, `${version.id}: every deterministic warning appearance must be cued`);
  assert.equal(events.filter(event => /cell-\d+ begins direct travel/.test(event.label)).length, source.travelStarts.length, `${version.id}: every deterministic travel start must be cued`);
  for (const appearance of source.appearances) {
    const event = events.find(event => event.label === `${appearance.id} warning appears`);
    near(event?.time, appearance.time, `${version.id}: ${appearance.id} appearance start`);
    near(event?.duration, appearance.duration, `${version.id}: ${appearance.id} appearance duration`);
  }
  for (const travel of source.travelStarts) near(events.find(event => event.label === `${travel.id} begins direct travel`)?.time, travel.time, `${version.id}: ${travel.id} travel`);
  for (const cluster of source.clusterEffects) {
    const event = events.find(event => event.label === `${cluster.cluster} ${cluster.effect}`);
    near(event?.time, cluster.time, `${version.id}: ${cluster.cluster} ${cluster.effect} start`);
    near(event?.duration, cluster.duration, `${version.id}: ${cluster.cluster} ${cluster.effect} duration`);
  }
  for (const [kind, characters] of Object.entries(source.typing)) {
    const prefix = kind === "command" ? "CLI" : kind === "query" ? "SQL query" : kind[0].toUpperCase() + kind.slice(1);
    const typedEvents = events.filter(event => event.label.startsWith(`${prefix} character `));
    assert.equal(typedEvents.length, characters.length, `${version.id}: every ${kind} character boundary must be cued`);
    characters.forEach((character, index) => near(typedEvents[index]?.time, character.time, `${version.id}: ${kind} character ${index + 1}`));
  }
  const clipEvents = {
    agentWindowEnter: "Agent window begins entering",
    issuePadding: "Issue badge padding expands",
    issueBackground: "Issue badge background fills",
    issueWarningIn: "Blue badge warning appears",
    messageSend: "Send motion begins",
    agentWindowExit: "Agent window begins exiting",
  };
  for (const [key, label] of Object.entries(clipEvents)) {
    const event = events.find(item => item.label === label);
    near(event?.time, source.clips[key].time, `${version.id}: ${label} start`);
    near(event?.duration, source.clips[key].duration, `${version.id}: ${label} duration`);
  }
}

console.log("All soundtrack versions derive action timing from the authoritative animation sources.");
