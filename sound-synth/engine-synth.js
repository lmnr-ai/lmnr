(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EngineSynth = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max, fallback = min) => Math.min(max, Math.max(min, finite(value, fallback)));
  const DIRECTIONS = ["servo", "turbine", "mechanical", "ratchet"];
  const DEFAULTS = {
    servo: { direction: "servo", note: 60, detune: 0, speed: .42, power: .48, brightness: .5, resonance: .65, noise: .025, pulseDepth: .68, pulseSharpness: 3.2, duration: 4, spinUp: .8, spinDown: 1, volume: .38, clickLevel: .3, clickTone: .5, clickDecay: 38, teeth: 4, whirrLevel: .28 },
    turbine: { direction: "turbine", note: 72, detune: 0, speed: .58, power: .34, brightness: .68, resonance: 1.1, noise: .035, pulseDepth: .65, pulseSharpness: 4.1, duration: 4, spinUp: 1.1, spinDown: 1.2, volume: .32, clickLevel: .3, clickTone: .5, clickDecay: 38, teeth: 4, whirrLevel: .28 },
    mechanical: { direction: "mechanical", note: 48, detune: 0, speed: .3, power: .65, brightness: .38, resonance: 1.4, noise: .075, pulseDepth: .72, pulseSharpness: 2.5, duration: 4, spinUp: .65, spinDown: 1, volume: .34, clickLevel: .3, clickTone: .5, clickDecay: 38, teeth: 4, whirrLevel: .28 },
    ratchet: { direction: "ratchet", note: 60, detune: 0, speed: .22, power: .38, brightness: .52, resonance: 2.2, noise: .1, pulseDepth: .28, pulseSharpness: 4.5, duration: 4, spinUp: .45, spinDown: .8, volume: .28, clickLevel: .36, clickTone: .42, clickDecay: 34, teeth: 4, whirrLevel: .24 },
  };

  function midiFrequency(note, detune = 0) { return 440 * Math.pow(2, (clamp(note, 36, 84, 60) - 69 + clamp(detune, -50, 50, 0) / 100) / 12); }
  function noteName(note) { return `${["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][note % 12]}${Math.floor(note / 12) - 1}`; }
  function normalizeSettings(input = {}, directionHint) {
    const requested = input.direction ?? directionHint;
    const direction = DIRECTIONS.includes(requested) ? requested : (DIRECTIONS.includes(directionHint) ? directionHint : "servo");
    const d = DEFAULTS[direction];
    return {
      direction,
      note: Math.round(clamp(input.note, 36, 84, d.note)), detune: clamp(input.detune, -50, 50, d.detune),
      speed: clamp(input.speed, 0, 1, d.speed), power: clamp(input.power, 0, 1, d.power),
      brightness: clamp(input.brightness, 0, 1, d.brightness), resonance: clamp(input.resonance, .2, 12, d.resonance),
      noise: clamp(input.noise, 0, .35, d.noise), pulseDepth: clamp(input.pulseDepth, 0, 1, d.pulseDepth),
      pulseSharpness: clamp(input.pulseSharpness, .5, 8, d.pulseSharpness), duration: clamp(input.duration, .01, 20, d.duration),
      spinUp: clamp(input.spinUp, 0, 5, d.spinUp), spinDown: clamp(input.spinDown, 0, 5, d.spinDown), volume: clamp(input.volume, 0, .8, d.volume),
      clickLevel: clamp(input.clickLevel, 0, .7, d.clickLevel), clickTone: clamp(input.clickTone, 0, 1, d.clickTone),
      clickDecay: clamp(input.clickDecay, 8, 120, d.clickDecay), teeth: Math.round(clamp(input.teeth, 1, 8, d.teeth)), whirrLevel: clamp(input.whirrLevel, 0, .6, d.whirrLevel),
    };
  }

  function scaleTimedRamps(duration, spinUp, spinDown) {
    const total = Math.max(0, finite(duration, 0)); let up = Math.max(0, finite(spinUp, 0)); let down = Math.max(0, finite(spinDown, 0));
    if (up + down > total && up + down > 0) { const scale = total / (up + down); up *= scale; down *= scale; }
    return { duration: total, spinUp: up, hold: Math.max(0, total - up - down), spinDown: down };
  }
  function rampValueAt(elapsed, start, target, rampSeconds) { if (rampSeconds <= 0) return target; const p = clamp(elapsed / rampSeconds, 0, 1); return start + (target - start) * p; }
  function mapMacros(direction, speed, power, settings = {}) {
    const d = normalizeSettings({ ...settings, direction, speed, power });
    const pitch = midiFrequency(d.note, d.detune);
    return { rotation: 1.5 + d.speed * 10.5, pitch, brightness: Math.min(12000, Math.max(280, pitch * (2.2 + d.brightness * 13))), body: .012 + d.power * .07, pulseDepth: d.pulseDepth, pulseFloor: .22 };
  }

  function makeLoopingNoise(ctx) {
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate)), ctx.sampleRate); const data = buffer.getChannelData(0); let smooth = 0;
    for (let i = 0; i < data.length; i++) { smooth = smooth * .82 + (Math.random() * 2 - 1) * .18; data[i] = smooth; }
    const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true; return source;
  }
  function pulseCurve(power) { const curve = new Float32Array(257); for (let i = 0; i < curve.length; i++) curve[i] = Math.pow(i / (curve.length - 1), power); return curve; }

  function createVoice(ctx, destination, initialSettings, options = {}) {
    const settings = normalizeSettings(initialSettings); const direction = settings.direction; const now = options.startTime ?? ctx.currentTime;
    const initial = mapMacros(direction, settings.speed, settings.power, settings); const up = Math.max(0, finite(options.spinUp ?? settings.spinUp, 0));
    const master = ctx.createGain(), sourceBus = ctx.createGain(), filter = ctx.createBiquadFilter();
    const sources = [], nodes = [master, sourceBus, filter], automation = new Map(), pitchParams = [];
    let stopped = false, cleanupTimer = null, fmDepth = null;
    function valueAt(track, time) { if (!track) return 0; if (time <= track.time) return track.start; if (track.kind === "linear") return rampValueAt(time - track.time, track.start, track.target, track.end - track.time); if (track.kind === "target") return track.target + (track.start - track.target) * Math.exp(-(time - track.time) / track.constant); return track.target; }
    function setAt(param, value, time) { param.setValueAtTime(value, time); automation.set(param, { kind: "set", start: value, target: value, time }); }
    function linear(param, value, end) { const startTime = now; const start = valueAt(automation.get(param), startTime); param.linearRampToValueAtTime(value, end); automation.set(param, { kind: "linear", start, target: value, time: startTime, end }); }
    function hold(param, time) { const value = valueAt(automation.get(param), time); if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(time); else { param.cancelScheduledValues(time); param.setValueAtTime(value, time); } automation.set(param, { kind: "set", start: value, target: value, time }); return value; }
    function target(param, value, time, constant = .045) { const start = hold(param, time); param.setTargetAtTime(value, time, constant); automation.set(param, { kind: "target", start, target: value, time, constant }); }
    function tracked(param, value) { setAt(param, value, now); return param; }
    function addTone(type, ratio, level) { const osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = type; tracked(osc.frequency, initial.pitch * ratio); gain.gain.value = level; osc.connect(gain).connect(sourceBus); sources.push(osc); nodes.push(gain); pitchParams.push([osc.frequency, ratio]); return osc; }

    tracked(master.gain, 0); linear(master.gain, settings.volume * .3, now + up); tracked(sourceBus.gain, 1);
    filter.type = "lowpass"; tracked(filter.frequency, 280); linear(filter.frequency, initial.brightness, now + up); tracked(filter.Q, settings.resonance);
    sourceBus.connect(filter).connect(master).connect(destination);

    if (direction === "servo") { addTone("sine", 1, .34); addTone("sine", 2.006, .09); addTone("sine", 3.985, .027); }
    else if (direction === "turbine") {
      const carrier = addTone("sine", 1, .27), mod = ctx.createOscillator(); fmDepth = ctx.createGain(); mod.type = "sine"; tracked(mod.frequency, initial.pitch * 1.414); tracked(fmDepth.gain, initial.pitch * .018); mod.connect(fmDepth).connect(carrier.frequency); sources.push(mod); nodes.push(fmDepth); pitchParams.push([mod.frequency, 1.414]); addTone("sine", 2.72, .032);
    } else if (direction === "mechanical") addTone("triangle", 1, .25);

    const weight = ctx.createOscillator(), weightGain = ctx.createGain(); weight.type = "sine"; tracked(weight.frequency, initial.pitch / 4); pitchParams.push([weight.frequency, .25]); tracked(weightGain.gain, initial.body); weight.connect(weightGain).connect(sourceBus); sources.push(weight); nodes.push(weightGain);
    const noise = makeLoopingNoise(ctx), noiseFilter = ctx.createBiquadFilter(), noiseGain = ctx.createGain(); noiseFilter.type = "bandpass"; tracked(noiseFilter.frequency, Math.min(12000, initial.pitch * 4)); tracked(noiseFilter.Q, 1.4); tracked(noiseGain.gain, settings.noise * .42); noise.connect(noiseFilter).connect(noiseGain).connect(sourceBus); sources.push(noise); nodes.push(noiseFilter, noiseGain);

    const rotor = ctx.createOscillator(); rotor.type = "sine"; tracked(rotor.frequency, .25); linear(rotor.frequency, initial.rotation, now + up);
    const broad = ctx.createWaveShaper(), sharp = ctx.createWaveShaper(), broadGain = ctx.createGain(), sharpGain = ctx.createGain(), amplitudeMotion = ctx.createGain(), brightnessMotion = ctx.createGain();
    broad.curve = pulseCurve(1.2); sharp.curve = pulseCurve(8); tracked(broadGain.gain, (8 - settings.pulseSharpness) / 7.5); tracked(sharpGain.gain, (settings.pulseSharpness - .5) / 7.5); tracked(amplitudeMotion.gain, settings.pulseDepth * .72); tracked(brightnessMotion.gain, settings.pulseDepth * initial.brightness * .32);
    rotor.connect(broad).connect(broadGain).connect(amplitudeMotion); rotor.connect(sharp).connect(sharpGain).connect(amplitudeMotion); amplitudeMotion.connect(sourceBus.gain); broadGain.connect(brightnessMotion); sharpGain.connect(brightnessMotion); brightnessMotion.connect(filter.frequency);
    sources.push(rotor); nodes.push(broad, sharp, broadGain, sharpGain, amplitudeMotion, brightnessMotion);

    let clickRate = null, clickLevel = null, clickFilter = null, whirrLevel = null, ratchetTimer = null, ratchetStopTime = Infinity;
    const clickVoices = new Set(), scheduledClicks = [];
    let nextTooth = 0, phaseAnchor = 0;
    let rateMotion = { kind: "linear", start: .25 * settings.teeth, target: initial.rotation * settings.teeth, time: now, end: now + up };
    function ratchetPhaseAt(time) {
      const elapsed = Math.max(0, time - rateMotion.time);
      const { start, target: rate } = rateMotion;
      if (rateMotion.kind === "target") {
        return phaseAnchor + rate * elapsed + (start - rate) * rateMotion.constant * -Math.expm1(-elapsed / rateMotion.constant);
      }
      const duration = rateMotion.end - rateMotion.time;
      const ramp = Math.min(elapsed, Math.max(0, duration));
      return phaseAnchor + (duration > 0 ? start * ramp + (rate - start) * ramp * ramp / (2 * duration) : 0) + rate * (elapsed - ramp);
    }
    function setRatchetRate(targetRate, at, ramp = .045, kind = "target") {
      const phase = ratchetPhaseAt(at), currentRate = valueAt(rateMotion, at);
      phaseAnchor = phase;
      rateMotion = { kind, start: currentRate, target: targetRate, time: at, end: at + ramp, constant: ramp };
    }
    function scheduleRatchet() {
      if (ratchetTimer) clearTimeout(ratchetTimer);
      ratchetTimer = null;
      if (!clickLevel || ctx.currentTime >= ratchetStopTime) return;
      const earliestTime = Math.max(now, ctx.currentTime, rateMotion.time);
      const horizon = Math.min(ratchetStopTime, ctx.currentTime + .08);
      // Skip missed teeth after a stall. Never submit past-due sources in a burst.
      nextTooth = Math.max(nextTooth, Math.ceil(ratchetPhaseAt(earliestTime) - 1e-9));
      while (nextTooth <= ratchetPhaseAt(horizon) + 1e-9 && earliestTime <= horizon) {
        // Integrate rotation and find the next whole-tooth phase crossing. Using
        // 1/currentRate instead would miss most teeth during acceleration.
        let low = earliestTime, high = horizon;
        for (let i = 0; i < 36; i++) {
          const middle = (low + high) / 2;
          if (ratchetPhaseAt(middle) < nextTooth) low = middle; else high = middle;
        }
        const nextClickTime = high;
        const strike = ctx.createOscillator(), envelope = ctx.createGain();
        const decay = settings.clickDecay / 1000;
        strike.type = "sine";
        strike.frequency.setValueAtTime(mapMacros(direction, settings.speed, settings.power, settings).pitch * (1.4 + settings.clickTone * 5), nextClickTime);
        envelope.gain.setValueAtTime(.0001, nextClickTime);
        envelope.gain.linearRampToValueAtTime(1, nextClickTime + .0015);
        envelope.gain.exponentialRampToValueAtTime(.0001, nextClickTime + decay);
        strike.connect(envelope).connect(clickFilter);
        strike.start(nextClickTime); strike.stop(nextClickTime + decay + .004);
        const voice = { strike, envelope, time: nextClickTime, tooth: nextTooth }; clickVoices.add(voice);
        strike.onended = () => { clickVoices.delete(voice); try { strike.disconnect(); envelope.disconnect(); } catch {} };
        scheduledClicks.push({ time: nextClickTime, end: nextClickTime + decay });
        if (scheduledClicks.length > 256) scheduledClicks.splice(0, scheduledClicks.length - 256);
        nextTooth++;
      }
      ratchetTimer = setTimeout(scheduleRatchet, 25);
      if (typeof ratchetTimer?.unref === "function") ratchetTimer.unref();
    }
    function rescheduleRatchetFrom(at) {
      let earliestTooth = Infinity;
      clickVoices.forEach((voice) => {
        if (voice.time > at) { earliestTooth = Math.min(earliestTooth, voice.tooth); try { voice.strike.stop(at); } catch {} clickVoices.delete(voice); }
      });
      if (earliestTooth < Infinity) nextTooth = earliestTooth;
      for (let i = scheduledClicks.length - 1; i >= 0; i--) if (scheduledClicks[i].time > at) scheduledClicks.splice(i, 1);
      scheduleRatchet();
    }
    if (direction === "ratchet") {
      // This silent tracked oscillator mirrors cadence for smooth automation/debugging;
      // actual strikes use audio-clock envelopes so decay remains milliseconds, not phase width.
      clickRate = ctx.createOscillator(); clickRate.type = "sawtooth"; tracked(clickRate.frequency, .25 * settings.teeth); linear(clickRate.frequency, initial.rotation * settings.teeth, now + up);
      clickLevel = ctx.createGain(); clickFilter = ctx.createBiquadFilter(); clickFilter.type = "bandpass";
      tracked(clickLevel.gain, settings.clickLevel * .42); tracked(clickFilter.frequency, initial.pitch * (1.4 + settings.clickTone * 5)); tracked(clickFilter.Q, 1.2 + settings.resonance * .35);
      clickFilter.connect(clickLevel).connect(filter);
      whirrLevel = ctx.createGain(); tracked(whirrLevel.gain, settings.whirrLevel * .34); noise.connect(whirrLevel).connect(filter);
      sources.push(clickRate); nodes.push(clickLevel, clickFilter, whirrLevel);
      scheduleRatchet();
    }
    sources.forEach((source) => source.start(now));

    function update(next) {
      if (stopped) return; const normalized = normalizeSettings({ ...settings, ...next }, direction); Object.assign(settings, normalized); const at = ctx.currentTime; const mapped = mapMacros(direction, settings.speed, settings.power, settings);
      if (next.speed !== undefined) { target(rotor.frequency, mapped.rotation, at); if (clickRate) { target(clickRate.frequency, mapped.rotation * settings.teeth, at); setRatchetRate(mapped.rotation * settings.teeth, at); rescheduleRatchetFrom(at); } }
      if (next.note !== undefined || next.detune !== undefined) { pitchParams.forEach(([param, ratio]) => target(param, mapped.pitch * ratio, at)); if (fmDepth) target(fmDepth.gain, mapped.pitch * .018, at); target(noiseFilter.frequency, Math.min(12000, mapped.pitch * 4), at); if (clickFilter) target(clickFilter.frequency, mapped.pitch * (1.4 + settings.clickTone * 5), at); }
      if (next.power !== undefined) target(weightGain.gain, mapped.body, at);
      if (next.brightness !== undefined || next.note !== undefined || next.detune !== undefined) { target(filter.frequency, mapped.brightness, at); target(brightnessMotion.gain, settings.pulseDepth * mapped.brightness * .32, at); }
      if (next.resonance !== undefined) { target(filter.Q, settings.resonance, at); if (clickFilter) target(clickFilter.Q, 1.2 + settings.resonance * .35, at); }
      if (next.noise !== undefined) target(noiseGain.gain, settings.noise * .42, at);
      if (next.pulseDepth !== undefined) { target(amplitudeMotion.gain, settings.pulseDepth * .72, at); target(brightnessMotion.gain, settings.pulseDepth * mapped.brightness * .32, at); }
      if (next.pulseSharpness !== undefined) { target(broadGain.gain, (8 - settings.pulseSharpness) / 7.5, at); target(sharpGain.gain, (settings.pulseSharpness - .5) / 7.5, at); }
      if (next.volume !== undefined) target(master.gain, settings.volume * .3, at);
      if (clickRate && next.teeth !== undefined) { target(clickRate.frequency, mapped.rotation * settings.teeth, at); setRatchetRate(mapped.rotation * settings.teeth, at); rescheduleRatchetFrom(at); }
      if (clickLevel && next.clickLevel !== undefined) target(clickLevel.gain, settings.clickLevel * .42, at);
      if (clickFilter && next.clickTone !== undefined) target(clickFilter.frequency, mapped.pitch * (1.4 + settings.clickTone * 5), at);
      if (whirrLevel && next.whirrLevel !== undefined) target(whirrLevel.gain, settings.whirrLevel * .34, at);
    }
    function disconnect() { [...sources, ...nodes].forEach((node) => { try { node.disconnect(); } catch {} }); }
    function stop(spinDown = settings.spinDown) {
      if (stopped) return; stopped = true; if (cleanupTimer) clearTimeout(cleanupTimer); const at = ctx.currentTime, down = Math.max(0, finite(spinDown, 0));
      const motionParams = [rotor.frequency, filter.frequency, weightGain.gain, sourceBus.gain, amplitudeMotion.gain, brightnessMotion.gain]; if (clickRate) motionParams.push(clickRate.frequency);
      motionParams.forEach((param) => hold(param, at)); linear(rotor.frequency, .25, at + down); if (clickRate) { linear(clickRate.frequency, .25 * settings.teeth, at + down); setRatchetRate(.25 * settings.teeth, at, down, "linear"); ratchetStopTime = at + down; rescheduleRatchetFrom(at); } hold(master.gain, at); linear(master.gain, 0, at + Math.max(.008, down));
      const stopAt = at + Math.max(.012, down + .012); sources.forEach((source) => { try { source.stop(stopAt); } catch {} }); clickVoices.forEach(({ strike }) => { try { strike.stop(stopAt); } catch {} });
      cleanupTimer = setTimeout(() => { if (ratchetTimer) clearTimeout(ratchetTimer); disconnect(); }, Math.max(20, (stopAt - ctx.currentTime + .03) * 1000));
    }
    return { update, stop, get stopped() { return stopped; }, direction, debug: { automation, rotor, clickRate, sourceBus, weightGain, amplitudeMotion, brightnessMotion, master, filter, noiseGain, pitchParams, fmDepth, clickLevel, clickFilter, whirrLevel, scheduledClicks, scheduleRatchet } };
  }

  function createController(getContext, getSettings, onStateChange = function () {}, timers = {
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timer) => clearTimeout(timer),
  }) {
    let voice = null, generation = 0, timer = null, state = "idle";
    const setState = (next) => { state = next; onStateChange(next); }; const clearTimer = () => { if (timer) timers.clearTimeout(timer); timer = null; };
    async function start(timed) { const token = ++generation; clearTimer(); voice?.stop(.03); voice = null; setState("pending"); const ctx = getContext(); if (ctx.state === "suspended") await ctx.resume(); if (token !== generation) return null; const settings = normalizeSettings(getSettings()); const ramps = timed ? scaleTimedRamps(settings.duration, settings.spinUp, settings.spinDown) : { spinUp: settings.spinUp }; const startTime = ctx.currentTime + .01; voice = createVoice(ctx, ctx.destination, settings, { startTime, spinUp: ramps.spinUp }); setState(timed ? "timed" : "continuous"); if (timed) timer = timers.setTimeout(() => { timer = null; if (token !== generation || !voice) return; voice.stop(ramps.spinDown); voice = null; setState("releasing"); timer = timers.setTimeout(() => { timer = null; if (token === generation) setState("idle"); }, ramps.spinDown * 1000); }, (Math.max(0, startTime - ctx.currentTime) + Math.max(0, ramps.duration - ramps.spinDown)) * 1000); return voice; }
    function stop(spinDown) { generation++; clearTimer(); const down = Math.max(0, finite(spinDown ?? normalizeSettings(getSettings()).spinDown, 0)); if (voice) voice.stop(down); voice = null; if (state === "idle") return; setState("releasing"); timer = timers.setTimeout(() => { timer = null; setState("idle"); }, down * 1000); }
    return { start, stop, stopContinuous: (down) => { if (state === "continuous") stop(down); }, update: (changes) => voice?.update(changes), getState: () => state, isActive: () => state !== "idle" };
  }
  return { DIRECTIONS, DEFAULTS, normalizeSettings, midiFrequency, noteName, scaleTimedRamps, rampValueAt, mapMacros, createVoice, createController };
});
