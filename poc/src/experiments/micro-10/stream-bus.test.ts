import assert from 'node:assert/strict';

class MockParam {
  value = 0;
  calls: Array<[string, number, number?]> = [];
  setValueAtTime(value: number, time: number) { this.value = value; this.calls.push(['set', value, time]); }
  setTargetAtTime(value: number, time: number) { this.value = value; this.calls.push(['target', value, time]); }
  linearRampToValueAtTime(value: number, time: number) { this.value = value; this.calls.push(['linear', value, time]); }
  exponentialRampToValueAtTime(value: number, time: number) { this.value = value; this.calls.push(['exponential', value, time]); }
  setValueCurveAtTime(_curve: Float32Array, time: number, duration: number) { this.calls.push(['curve', time, duration]); }
  cancelScheduledValues(time: number) { this.calls.push(['cancel', time]); }
}
class MockNode {
  connections: MockNode[] = [];
  connect(node: MockNode) { this.connections.push(node); return node; }
}
class MockGain extends MockNode { gain = new MockParam(); }
class MockSource extends MockNode {
  buffer?: unknown;
  stopTimes: number[] = [];
  start(_time: number) {}
  stop(time: number) { this.stopTimes.push(time); }
  addEventListener(_name: string, _listener: () => void, _options: unknown) {}
}
class MockOscillator extends MockSource {
  type = 'sine'; frequency = new MockParam(); detune = new MockParam();
}
class MockFilter extends MockNode { type = 'lowpass'; frequency = new MockParam(); Q = new MockParam(); }
class MockPanner extends MockNode { pan = new MockParam(); }
class MockDelay extends MockNode { delayTime = new MockParam(); }
class MockShaper extends MockNode { curve?: Float32Array; oversample = 'none'; }
class MockConvolver extends MockNode { buffer?: unknown; }
class MockAudioContext {
  currentTime = 10;
  state = 'running';
  sampleRate = 100;
  destination = new MockNode();
  gains: MockGain[] = [];
  sources: MockSource[] = [];
  createGain() { const node = new MockGain(); this.gains.push(node); return node; }
  createBufferSource() { const node = new MockSource(); this.sources.push(node); return node; }
  createOscillator() { const node = new MockOscillator(); this.sources.push(node); return node; }
  createBuffer(_channels: number, length: number) { return {getChannelData: () => new Float32Array(length)}; }
  createBiquadFilter() { return new MockFilter(); }
  createStereoPanner() { return new MockPanner(); }
  createDelay() { return new MockDelay(); }
  createWaveShaper() { return new MockShaper(); }
  createConvolver() { return new MockConvolver(); }
  async resume() {}
  async close() {}
}

const contexts: MockAudioContext[] = [];
(globalThis as {AudioContext?: unknown}).AudioContext = class extends MockAudioContext {
  constructor() { super(); contexts.push(this); }
};
const {Micro10AudioEngine} = await import('./sound');
const engine = new Micro10AudioEngine();
await engine.enable();
const context = contexts[0];
const [output, streamBus] = context.gains;
assert.equal(streamBus.connections[0], output, 'tick/puff family has a dedicated bus before the shared output');
assert.equal(output.gain.value, 1, 'standalone engine defaults to unity master gain');
await engine.enable();
assert.equal(output.connections.length, 1, 're-enabling does not reconnect the output graph and amplify it');
engine.setMasterGain(0);
assert.equal(output.gain.value, 0, 'master zero promptly silences active and scheduled voices at the shared output');
engine.setMasterGain(4);
assert.equal(output.gain.value, 4, 'master gain above one is not clamped');
engine.setMasterGain(1);
engine.setStreamGain(.5);
engine.setMix({tickVolume: .2, puffVolume: .3, droneVolume: 0, whooshVolume: .4, drawerVolume: .6, cameraVolume: .8, flowRatchetVolume: .45});
assert.equal(streamBus.gain.value, .5, 'live user mix changes cannot reset the stream fade envelope');
engine.play('flowRatchet');
const ratchetLevel = context.gains.at(-1)!;
assert.equal(ratchetLevel.gain.value, .45, 'Flow ratchet has an independent live volume stage');
assert.equal(ratchetLevel.connections[0], output, 'Flow ratchet bypasses the completed stream family bus');
engine.setMix({tickVolume: .2, puffVolume: .3, droneVolume: 0, numberDropVolume: .37});
engine.play('numberDropPiano');
const numberDropLevel = context.gains.find(gain => gain.gain.value === .37)!;
assert.ok(numberDropLevel, 'Flow number-drop piano has an independent volume stage');
engine.setMix({tickVolume: .2, puffVolume: .3, droneVolume: 0, numberDropVolume: .63});
assert.equal(numberDropLevel.gain.value, .63, 'number-drop volume updates active piano tails');
const numberDropSource = context.sources.at(-1)!;
const scheduledNumberDropStops = numberDropSource.stopTimes.length;
engine.pause();
assert.ok(numberDropSource.stopTimes.length > scheduledNumberDropStops, 'pause cancels active number-drop piano tails');
engine.play('cloudOut', 1);
const cloudSource = context.sources.at(-1)!;
const cloudStopsBefore = cloudSource.stopTimes.length;
engine.play('puff');
const puffSource = context.sources.at(-1)!;
assert.ok(context.gains.some(gain => gain !== streamBus && gain.connections.includes(streamBus)), 'puff voice level feeds the family bus');
engine.silenceStream();
assert.equal(streamBus.gain.value, 0);
assert.ok(puffSource.stopTimes.length > 1, 'tail completion trims the residual puff voice');
assert.equal(cloudSource.stopTimes.length, cloudStopsBefore, 'tail completion does not truncate an unrelated cloud voice');
engine.setMix({tickVolume: 1, puffVolume: 1, droneVolume: 0, whooshVolume: 1});
assert.equal(streamBus.gain.value, 0, 'later mix updates cannot resurrect a completed stream tail');
await engine.dispose();
console.log('Micro10 stream family bus isolates its envelope from mix and unrelated effects.');
