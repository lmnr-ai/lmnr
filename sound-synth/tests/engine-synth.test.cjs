const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const sandbox = { module: { exports: {} }, exports: {}, globalThis: {}, setTimeout, clearTimeout, Float32Array, Math };
vm.runInNewContext(fs.readFileSync(require.resolve("../engine-synth.js"), "utf8"), sandbox);
const EngineSynth = sandbox.module.exports;

class FakeParam {
  constructor(value = 0, canHold = true) {
    this.value = value;
    this.events = [];
    if (!canHold) this.cancelAndHoldAtTime = undefined;
  }
  setValueAtTime(value, time) { this.value = value; this.events.push(["set", value, time]); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push(["linear", value, time]); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push(["exponential", value, time]); }
  setTargetAtTime(value, time, constant) { this.value = value; this.events.push(["target", value, time, constant]); }
  cancelScheduledValues(time) { this.events.push(["cancel", time]); }
  cancelAndHoldAtTime(time) { this.events.push(["hold", time]); }
}

class FakeNode {
  constructor(kind, canHold) {
    this.kind = kind;
    this.gain = new FakeParam(1, canHold);
    this.frequency = new FakeParam(0, canHold);
    this.Q = new FakeParam(0, canHold);
    this.started = [];
    this.stopped = [];
    this.connections = [];
    this.disconnected = false;
  }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; }
  start(time) { this.started.push(time); }
  stop(time) { this.stopped.push(time); }
}

function fakeContext(canHold = true) {
  const nodes = [];
  const make = (kind) => () => { const node = new FakeNode(kind, canHold); nodes.push(node); return node; };
  const destination = new FakeNode("destination", canHold);
  nodes.push(destination);
  return {
    currentTime: 0,
    state: "running",
    sampleRate: 8000,
    destination,
    nodes,
    createGain: make("gain"),
    createBiquadFilter: make("filter"),
    createOscillator: make("oscillator"),
    createBufferSource: make("buffer"),
    createWaveShaper: make("waveshaper"),
    createBuffer(channels, length) {
      const arrays = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: (channel) => arrays[channel] };
    },
  };
}

const base = { direction: "servo", speed: .5, power: .5, volume: .4, spinUp: 2, spinDown: 1, duration: 5 };

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

class FakeClock {
  constructor(ctx) { this.ctx = ctx; this.now = 0; this.nextId = 1; this.tasks = new Map(); }
  setTimeout(callback, delay) {
    const id = this.nextId++;
    this.tasks.set(id, { callback, due: this.now + delay });
    return id;
  }
  clearTimeout(id) { this.tasks.delete(id); }
  tick(ms) {
    const end = this.now + ms;
    while (true) {
      const next = [...this.tasks.entries()].sort((a, b) => a[1].due - b[1].due)[0];
      if (!next || next[1].due > end) break;
      this.now = next[1].due;
      this.ctx.currentTime = this.now / 1000;
      this.tasks.delete(next[0]);
      next[1].callback();
    }
    this.now = end;
    this.ctx.currentTime = end / 1000;
  }
}

test("pitch transposes independently from rotation and power only changes low body", () => {
  for (const direction of EngineSynth.DIRECTIONS) {
    const lowSpeed = EngineSynth.mapMacros(direction, .1, .6, { note: 60 });
    const highSpeed = EngineSynth.mapMacros(direction, .9, .6, { note: 60 });
    assert.ok(highSpeed.rotation > lowSpeed.rotation);
    assert.equal(highSpeed.pitch, lowSpeed.pitch);
    assert.equal(highSpeed.brightness, lowSpeed.brightness);
    assert.equal(highSpeed.body, lowSpeed.body);
    const octave = EngineSynth.mapMacros(direction, .1, .6, { note: 72 });
    assert.ok(Math.abs(octave.pitch / lowSpeed.pitch - 2) < 1e-10);
    assert.equal(octave.rotation, lowSpeed.rotation);
    const fine = EngineSynth.mapMacros(direction, .1, .6, { note: 60, detune: 50 });
    assert.ok(Math.abs(fine.pitch / lowSpeed.pitch - Math.pow(2, 1 / 24)) < 1e-10);
    const highPower = EngineSynth.mapMacros(direction, .1, .9, { note: 60 });
    assert.ok(highPower.body > lowSpeed.body);
    assert.equal(highPower.rotation, lowSpeed.rotation);
    assert.equal(highPower.pitch, lowSpeed.pitch);
  }
});

test("normalization uses direction defaults and clamps malformed strings", () => {
  assert.equal(EngineSynth.normalizeSettings({ direction: "servo" }).note, 60);
  assert.equal(EngineSynth.normalizeSettings({ direction: "turbine" }).note, 72);
  assert.equal(EngineSynth.normalizeSettings({ direction: "mechanical" }).note, 48);
  const bad = EngineSynth.normalizeSettings({ direction: "ratchet", note: "999", speed: "nope", teeth: "4.7", detune: -999 });
  assert.equal(bad.note, 84); assert.equal(bad.speed, EngineSynth.DEFAULTS.ratchet.speed); assert.equal(bad.teeth, 5); assert.equal(bad.detune, -50);
});

test("pulse depth zero is truly steady while defaults remain legibly cyclic", () => {
  for (const direction of EngineSynth.DIRECTIONS) {
    assert.equal(EngineSynth.mapMacros(direction, .5, .5, { pulseDepth: 0 }).pulseDepth, 0);
    assert.ok(EngineSynth.mapMacros(direction, .5, .5).pulseDepth >= .28);
  }
});

test("short timed duration proportionally scales ramps without a negative hold", () => {
  const short = EngineSynth.scaleTimedRamps(1, 2, 3);
  assert.equal(short.duration, 1);
  assert.equal(short.spinUp, .4);
  assert.equal(short.hold, 0);
  assert.equal(short.spinDown, .6000000000000001);
  const long = EngineSynth.scaleTimedRamps(5, 1, 2);
  assert.equal(long.hold, 2);
});

test("four recipes have meaningful distinct source graphs", () => {
  const signatures = {};
  for (const direction of ["servo", "turbine", "mechanical"]) {
    const ctx = fakeContext();
    EngineSynth.createVoice(ctx, ctx.destination, { ...base, direction });
    const oscillators = ctx.nodes.filter((node) => node.kind === "oscillator");
    signatures[direction] = {
      oscillatorTypes: oscillators.map((node) => node.type).sort().join(","),
      buffers: ctx.nodes.filter((node) => node.kind === "buffer").length,
      frequencyModulationEdges: ctx.nodes.reduce((count, node) => count + node.connections.filter((target) => oscillators.some((osc) => target === osc.frequency)).length, 0),
    };
  }
  assert.match(signatures.servo.oscillatorTypes, /sine,sine,sine/);
  assert.equal(signatures.servo.frequencyModulationEdges, 0);
  assert.ok(signatures.turbine.frequencyModulationEdges > 0);
  assert.equal(signatures.mechanical.buffers, 1);
  assert.match(signatures.mechanical.oscillatorTypes, /triangle/);
  const ratchetContext = fakeContext();
  EngineSynth.createVoice(ratchetContext, ratchetContext.destination, { ...base, direction: "ratchet" });
  assert.ok(ratchetContext.nodes.some((node) => node.kind === "oscillator" && node.type === "sawtooth"));
});

test("fallback automation holds repeated live edits at their instantaneous value", () => {
  const ctx = fakeContext(false);
  const voice = EngineSynth.createVoice(ctx, ctx.destination, base, { startTime: 0, spinUp: 2 });
  const rotor = voice.debug.rotor.frequency;
  const weight = voice.debug.weightGain.gain;
  const pulseDepth = voice.debug.amplitudeMotion.gain;
  ctx.currentTime = .5;
  voice.update({ speed: .9, power: .9, pulseDepth: .9 });
  ctx.currentTime = .8;
  voice.update({ speed: .2, power: .1, pulseDepth: .1 });
  ctx.currentTime = .9;
  voice.stop(.5);
  const heldSets = rotor.events.filter((event) => event[0] === "set" && event[2] > 0);
  assert.ok(heldSets.length >= 3);
  const first = heldSets[0][1];
  const second = heldSets[1][1];
  const stoppedAt = heldSets.at(-1)[1];
  assert.ok(first > .25 && first < EngineSynth.mapMacros("servo", .5, .5).rotation);
  assert.ok(second > first, "second edit continues from the first target segment instead of initial preset");
  const finalTarget = EngineSynth.mapMacros("servo", .2, .5).rotation;
  assert.ok(stoppedAt < second && stoppedAt > finalTarget, "stop holds the in-flight second target segment");
  assert.notEqual(stoppedAt, EngineSynth.mapMacros("servo", .5, .5).rotation);

  for (const [name, param, initial] of [
    ["weight", weight, EngineSynth.mapMacros("servo", .5, .5).body],
    ["pulse depth", pulseDepth, EngineSynth.mapMacros("servo", .5, .5).pulseDepth * .72],
  ]) {
    const values = param.events.filter((event) => event[0] === "set").map((event) => event[1]);
    assert.equal(values[0], initial, `${name} is seeded in the automation tracker`);
    assert.ok(values.slice(1).every((value) => value > 0), `${name} never falls back to zero`);
    assert.notEqual(values.at(-1), initial, `${name} stop holds the live second edit`);
  }
});

test("every live engine dial maps to an initialized AudioParam", () => {
  for (const direction of EngineSynth.DIRECTIONS) {
    const ctx = fakeContext(false);
    const voice = EngineSynth.createVoice(ctx, ctx.destination, { ...base, direction });
    ctx.currentTime = .2;
    voice.update({ note: 64, detune: 17, speed: .8, power: .2, brightness: .9, resonance: 5, noise: .2, pulseDepth: 0, pulseSharpness: 7, volume: .1 });
    for (const param of [voice.debug.rotor.frequency, voice.debug.weightGain.gain, voice.debug.filter.frequency, voice.debug.filter.Q, voice.debug.noiseGain.gain, voice.debug.amplitudeMotion.gain, voice.debug.master.gain, ...voice.debug.pitchParams.map(([param]) => param)]) {
      assert.ok(voice.debug.automation.has(param), `${direction} parameter is tracked`);
      assert.ok(param.events.some((event) => event[0] === "target"), `${direction} parameter receives a smooth live target`);
    }
    assert.equal(voice.debug.amplitudeMotion.gain.events.at(-1)[1], 0);
  }
});

test("turbine octave updates carrier, modulator, and FM deviation without changing rotation", () => {
  const ctx = fakeContext(false);
  const voice = EngineSynth.createVoice(ctx, ctx.destination, { ...base, direction: "turbine", note: 60 }, { spinUp: 0 });
  const rotationBefore = voice.debug.rotor.frequency.events.at(-1)[1];
  const initialDeviation = voice.debug.fmDepth.gain.events[0][1];
  ctx.currentTime = .2;
  voice.update({ note: 72 });
  assert.equal(voice.debug.fmDepth.gain.events.at(-1)[1], initialDeviation * 2);
  assert.equal(voice.debug.pitchParams[0][0].events.at(-1)[1], EngineSynth.midiFrequency(72));
  assert.equal(voice.debug.pitchParams[1][0].events.at(-1)[1], EngineSynth.midiFrequency(72) * 1.414);
  assert.equal(voice.debug.rotor.frequency.events.at(-1)[1], rotationBefore);
  voice.stop(0);
});

test("ratchet teeth scale click cadence and click/whirr controls are independent", () => {
  const ctx = fakeContext(false);
  const voice = EngineSynth.createVoice(ctx, ctx.destination, { ...base, direction: "ratchet", speed: .2, teeth: 2 });
  const rotation = EngineSynth.mapMacros("ratchet", .2, .5).rotation;
  assert.equal(voice.debug.clickRate.frequency.events.find((event) => event[0] === "linear")[1], rotation * 2);
  ctx.currentTime = .3;
  voice.update({ teeth: 7, clickLevel: 0, whirrLevel: .5, clickDecay: 100, clickTone: .9 });
  assert.equal(voice.debug.clickRate.frequency.events.at(-1)[1], rotation * 7);
  assert.equal(voice.debug.clickLevel.gain.events.at(-1)[1], 0);
  assert.ok(voice.debug.whirrLevel.gain.events.at(-1)[1] > 0);
  assert.ok(voice.debug.clickFilter.frequency.events.at(-1)[1] > 0);
  voice.stop(0);
});

test("ratchet decay is an absolute millisecond envelope independent of cadence", () => {
  const lowContext = fakeContext(false);
  const low = EngineSynth.createVoice(lowContext, lowContext.destination, { ...base, direction: "ratchet", speed: 0, teeth: 1, clickDecay: 40 }, { spinUp: 0 });
  const highContext = fakeContext(false);
  const high = EngineSynth.createVoice(highContext, highContext.destination, { ...base, direction: "ratchet", speed: 1, teeth: 8, clickDecay: 40 }, { spinUp: 0 });
  assert.ok(high.debug.scheduledClicks.length > low.debug.scheduledClicks.length, "cadence changes strike count in the fixed lookahead");
  for (const click of [...low.debug.scheduledClicks, ...high.debug.scheduledClicks]) assert.ok(Math.abs((click.end - click.time) * 1000 - 40) < 1e-9);
  highContext.currentTime = .01;
  high.update({ clickDecay: 90 });
  high.debug.scheduleRatchet();
  assert.ok(high.debug.scheduledClicks.some((click) => Math.abs((click.end - click.time) * 1000 - 90) < 1e-9));
  low.stop(0); high.stop(0);
});

test("ratchet strikes integrate accelerating rotation instead of waiting a full idle-rate period", () => {
  const ctx = fakeContext();
  const voice = EngineSynth.createVoice(ctx, ctx.destination, { ...base, direction: "ratchet", speed: 1, teeth: 2 }, { startTime: 0, spinUp: 1 });
  try {
    for (let t = .02; t <= .52; t += .02) { ctx.currentTime = t; voice.debug.scheduleRatchet(); }
    const clicks = voice.debug.scheduledClicks.filter(click => click.time <= .5);
    assert.equal(clicks.length, 4, "integral of .5→24 teeth/sec reaches three whole turns by .5s");
    for (let tooth = 0; tooth < clicks.length; tooth++) {
      const time = clicks[tooth].time;
      assert.ok(Math.abs(.5 * time + 11.75 * time * time - tooth) < 1e-6);
    }
  } finally { voice.stop(0); }
});

test("ratchet scheduling skips missed teeth after a main-thread stall rather than bursting", () => {
  const ctx = fakeContext();
  const voice = EngineSynth.createVoice(ctx, ctx.destination, { ...base, direction: "ratchet", speed: 1, teeth: 4 }, { startTime: 0, spinUp: 0 });
  try {
    const before = voice.debug.scheduledClicks.length;
    ctx.currentTime = 2;
    voice.debug.scheduleRatchet();
    const resumed = voice.debug.scheduledClicks.slice(before);
    assert.ok(resumed.length > 0 && resumed.length <= 5);
    assert.ok(resumed.every(click => click.time >= ctx.currentTime - 1e-9), "never submit past-due strikes to Web Audio");
  } finally { voice.stop(0); }
});

test("timed release and completion are aligned to scheduled audio start", async () => {
  const ctx = fakeContext();
  const clock = new FakeClock(ctx);
  const states = [];
  const settings = { ...base, duration: .1, spinUp: .06, spinDown: .04 };
  const timers = {
    setTimeout: clock.setTimeout.bind(clock),
    clearTimeout: clock.clearTimeout.bind(clock),
  };
  const controller = EngineSynth.createController(() => ctx, () => settings, (state) => states.push([state, clock.now]), timers);

  await controller.start(true);
  clock.tick(69);
  assert.equal(controller.getState(), "timed");
  clock.tick(1);
  assert.equal(controller.getState(), "releasing");
  assert.equal(ctx.currentTime, .07, "release is 60 ms after the source's 10 ms scheduled start");
  clock.tick(39);
  assert.equal(controller.getState(), "releasing");
  clock.tick(1);
  assert.equal(controller.getState(), "idle");
  assert.deepEqual(states.slice(-2), [["releasing", 70], ["idle", 110]]);
});

test("zero master volume stays at true silence through start and stop", () => {
  const ctx = fakeContext(false);
  const voice = EngineSynth.createVoice(ctx, ctx.destination, { ...base, volume: 0 }, { startTime: 0, spinUp: .2 });
  ctx.currentTime = .1;
  voice.stop(.1);
  const masterEvents = voice.debug.master.gain.events.filter((event) => event[0] === "set" || event[0] === "linear");
  assert.ok(masterEvents.length >= 4);
  assert.ok(masterEvents.every((event) => event[1] === 0));
});

test("controller distinguishes timed and continuous transitions and reports completion", async () => {
  const ctx = fakeContext();
  const states = [];
  const settings = { ...base, duration: .025, spinUp: .005, spinDown: .01 };
  const controller = EngineSynth.createController(() => ctx, () => settings, (state) => states.push(state));

  await controller.start(true);
  assert.equal(controller.getState(), "timed");
  await controller.start(false);
  assert.equal(controller.getState(), "continuous", "continuous replaces timed rather than stopping only");
  controller.stopContinuous(.005);
  assert.equal(controller.getState(), "releasing");
  await sleep(10);
  assert.equal(controller.getState(), "idle");

  await controller.start(false);
  await controller.start(true);
  assert.equal(controller.getState(), "timed", "timed replaces continuous and resets continuous UI state");
  await sleep(45);
  assert.equal(controller.getState(), "idle");
  assert.ok(states.includes("releasing"));
});

test("voice stop retires every source and disconnects graph nodes", async () => {
  const ctx = fakeContext();
  const voice = EngineSynth.createVoice(ctx, ctx.destination, base, { startTime: 0, spinUp: 2 });
  ctx.currentTime = .5;
  voice.stop(0);
  const sources = ctx.nodes.filter((node) => node.started.length);
  assert.ok(sources.length >= 5);
  assert.ok(sources.every((source) => source.stopped.length === 1));
  await sleep(60);
  const graphNodes = ctx.nodes.filter((node) => node !== ctx.destination);
  assert.ok(graphNodes.every((node) => node.disconnected));
});
