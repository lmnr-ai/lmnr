(() => {
  let context;
  let playback = null;

  const midiToFrequency = midi => 440 * 2 ** ((midi - 69) / 12);
  const getContext = () => {
    context ??= new AudioContext();
    if (context.state === "suspended") context.resume();
    return context;
  };

  function noiseBuffer(ctx, seconds, pink = true) {
    const buffer = ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * seconds)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let low = 0;
    for (let index = 0; index < data.length; index++) {
      const white = Math.random() * 2 - 1;
      low = pink ? low * .94 + white * .06 : white;
      data[index] = pink ? low * 3 : white;
    }
    return buffer;
  }

  function impulse(ctx, seconds = 2.4) {
    const buffer = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < data.length; index++) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / data.length) ** 2.6;
      }
    }
    return buffer;
  }

  const keep = (nodes, ...items) => nodes.push(...items.filter(Boolean));
  const safeStop = source => { try { source.stop(); } catch {} };
  const panner = (ctx, pan = 0) => {
    const node = ctx.createStereoPanner();
    node.pan.value = Math.max(-1, Math.min(1, pan));
    return node;
  };

  function piano(ctx, bus, event, at, nodes) {
    const notes = event.notes ?? [60];
    const velocity = event.velocity ?? .55;
    const brightness = event.brightness ?? .55;
    const release = Math.max(.25, event.release ?? event.duration ?? 1.8);
    const end = at + release;
    const strings = [-1, 1];
    notes.forEach((midi, noteIndex) => {
      strings.forEach(string => {
        for (let harmonic = 1; harmonic <= 6; harmonic++) {
          const oscillator = ctx.createOscillator();
          oscillator.type = "sine";
          oscillator.frequency.value = midiToFrequency(midi) * harmonic * (1 + harmonic * harmonic * .00028);
          oscillator.detune.value = string * 1.7;
          const gain = ctx.createGain();
          const color = Math.min(.97, .36 + brightness * .57);
          const peak = velocity * .17 * color ** (harmonic - 1) / harmonic ** 1.1 / Math.sqrt(notes.length) / strings.length;
          const partialRelease = Math.max(.16, release / (1 + (harmonic - 1) * .23));
          gain.gain.setValueAtTime(.0001, at);
          gain.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), at + .006 + (1 - velocity) * .008);
          gain.gain.exponentialRampToValueAtTime(.0001, at + partialRelease);
          const pan = panner(ctx, (event.pan ?? 0) + (noteIndex - (notes.length - 1) / 2) * .16 + string * .06);
          oscillator.connect(gain).connect(pan).connect(bus);
          oscillator.start(at);
          oscillator.stop(end + .05);
          keep(nodes, oscillator);
        }
      });
    });
    const hammer = ctx.createBufferSource();
    hammer.buffer = noiseBuffer(ctx, .045);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1200 + brightness * 5200;
    filter.Q.value = 1.1;
    const hit = ctx.createGain();
    hit.gain.setValueAtTime(Math.max(.0001, velocity * .032), at);
    hit.gain.exponentialRampToValueAtTime(.0001, at + .045);
    hammer.connect(filter).connect(hit).connect(bus);
    hammer.start(at);
    hammer.stop(at + .05);
    keep(nodes, hammer);
  }

  function pad(ctx, bus, event, at, nodes) {
    const notes = event.notes ?? [48, 55, 60];
    const gainAmount = event.gain ?? .055;
    const attack = Math.min(event.duration * .4, event.attack ?? .65);
    const release = Math.min(event.duration * .4, event.release ?? .8);
    notes.forEach((midi, index) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = event.wave ?? "sine";
      oscillator.frequency.value = midiToFrequency(midi);
      oscillator.detune.value = (index - (notes.length - 1) / 2) * 2.2;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.exponentialRampToValueAtTime(gainAmount / Math.sqrt(notes.length), at + attack);
      gain.gain.setValueAtTime(gainAmount / Math.sqrt(notes.length), at + Math.max(attack, event.duration - release));
      gain.gain.exponentialRampToValueAtTime(.0001, at + event.duration);
      const pan = panner(ctx, (event.pan ?? 0) + (index - (notes.length - 1) / 2) * .18);
      oscillator.connect(gain).connect(pan).connect(bus);
      oscillator.start(at);
      oscillator.stop(at + event.duration + .05);
      keep(nodes, oscillator);
    });
  }

  function pluck(ctx, bus, event, at, nodes) {
    [1, 2, 3].forEach((harmonic, index) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = index === 0 ? "triangle" : "sine";
      oscillator.frequency.value = midiToFrequency(event.note ?? 72) * harmonic;
      const gain = ctx.createGain();
      const peak = (event.velocity ?? .45) * .11 / harmonic;
      const duration = event.duration ?? .35;
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, at + duration / (1 + index * .35));
      oscillator.connect(gain).connect(panner(ctx, event.pan)).connect(bus);
      oscillator.start(at);
      oscillator.stop(at + duration + .03);
      keep(nodes, oscillator);
    });
  }

  function digital(ctx, bus, event, at, nodes) {
    const oscillator = ctx.createOscillator();
    oscillator.type = event.wave ?? "sine";
    oscillator.frequency.setValueAtTime(midiToFrequency(event.note ?? 76), at);
    if (event.toNote !== undefined) oscillator.frequency.exponentialRampToValueAtTime(midiToFrequency(event.toNote), at + event.duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime((event.velocity ?? .35) * .09, at + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, at + event.duration);
    oscillator.connect(gain).connect(panner(ctx, event.pan)).connect(bus);
    oscillator.start(at);
    oscillator.stop(at + event.duration + .03);
    keep(nodes, oscillator);
  }

  function chime(ctx, bus, event, at, nodes) {
    [1, 2.005, 3.01, 4.08].forEach((ratio, index) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = midiToFrequency(event.note ?? 76) * ratio;
      const gain = ctx.createGain();
      const duration = event.duration ?? 1.4;
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.exponentialRampToValueAtTime((event.velocity ?? .35) * .075 / (index + 1), at + .01);
      gain.gain.exponentialRampToValueAtTime(.0001, at + duration / (1 + index * .22));
      oscillator.connect(gain).connect(panner(ctx, event.pan)).connect(bus);
      oscillator.start(at);
      oscillator.stop(at + duration + .03);
      keep(nodes, oscillator);
    });
  }

  function puff(ctx, bus, event, at, nodes) {
    const duration = event.duration ?? .55;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx, duration, true);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = event.tone ?? 1100;
    filter.Q.value = event.soft ? .65 : 1.2;
    const gain = ctx.createGain();
    const peak = event.gain ?? (event.soft ? .035 : .06);
    gain.gain.setValueAtTime(Math.max(.0001, peak * .18), at);
    gain.gain.exponentialRampToValueAtTime(peak, at + Math.min(.035, duration * .18));
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter).connect(gain).connect(panner(ctx, event.pan)).connect(bus);
    source.start(at);
    source.stop(at + duration);
    keep(nodes, source);
  }

  function tick(ctx, bus, event, at, nodes) {
    const oscillator = ctx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = midiToFrequency(event.note ?? 48);
    const gain = ctx.createGain();
    const duration = event.duration ?? .09;
    gain.gain.setValueAtTime(event.gain ?? .025, at);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain).connect(panner(ctx, event.pan)).connect(bus);
    oscillator.start(at);
    oscillator.stop(at + duration);
    keep(nodes, oscillator);
  }

  function whoosh(ctx, bus, event, at, nodes) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx, event.duration, true);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = .8;
    filter.frequency.setValueAtTime(event.from ?? 300, at);
    filter.frequency.exponentialRampToValueAtTime(event.to ?? 4000, at + event.duration);
    const gain = ctx.createGain();
    const curve = new Float32Array(64);
    for (let index = 0; index < curve.length; index++) {
      const progress = index / (curve.length - 1);
      const shape = index === 0 ? .18 : Math.sin(Math.PI * progress);
      curve[index] = shape * (event.gain ?? .035);
    }
    gain.gain.setValueCurveAtTime(curve, at, event.duration);
    source.connect(filter).connect(gain).connect(panner(ctx, event.pan)).connect(bus);
    source.start(at);
    source.stop(at + event.duration);
    keep(nodes, source);
  }

  function pop(ctx, bus, event, at, nodes) {
    const count = Math.max(1, Math.min(32, Math.round(event.count ?? 1)));
    for (let index = 0; index < count; index++) {
      const offset = (index % 4) * .004;
      tick(ctx, bus, {
        note: (event.note ?? 76) + (index % 5) * 2,
        duration: .032 + (index % 3) * .006,
        gain: (event.gain ?? .006) / Math.sqrt(Math.max(1, count / 5)),
        pan: -0.85 + (index / Math.max(1, count - 1)) * 1.7,
      }, at + offset, nodes);
    }
  }

  function ratchet(ctx, bus, event, at, nodes) {
    const steps = Math.max(2, Math.round(event.steps ?? event.duration * 24));
    for (let index = 0; index < steps; index++) {
      const progress = index / Math.max(1, steps - 1);
      tick(ctx, bus, {
        note: (event.note ?? 62) + Math.round(progress * (event.rise ?? 12)),
        duration: Math.min(.035, event.duration / steps * .72),
        gain: (event.gain ?? .013) * (.72 + progress * .28),
        pan: (event.pan ?? 0) + (index % 2 ? .08 : -.08),
      }, at + progress * Math.max(0, event.duration - .025), nodes);
    }
  }

  function fill(ctx, bus, event, at, nodes) {
    digital(ctx, bus, {
      ...event,
      note: event.note ?? 62,
      toNote: event.toNote ?? 74,
      velocity: event.velocity ?? .34,
      wave: "sine",
    }, at, nodes);
    puff(ctx, bus, {
      ...event,
      tone: event.tone ?? 1750,
      gain: event.gain ?? .022,
      soft: true,
    }, at, nodes);
  }

  function doors(ctx, bus, event, at, nodes) {
    whoosh(ctx, bus, {...event,from:event.from ?? 1500,to:event.to ?? 300,gain:event.gain ?? .025,pan:-.55}, at, nodes);
    whoosh(ctx, bus, {...event,from:event.from ?? 1500,to:event.to ?? 300,gain:event.gain ?? .025,pan:.55}, at, nodes);
  }

  function latch(ctx, bus, event, at, nodes) {
    tick(ctx, bus, {note:event.note ?? 45,duration:event.duration ?? .11,gain:event.gain ?? .026,pan:event.pan ?? 0}, at, nodes);
    tick(ctx, bus, {note:(event.note ?? 45)+19,duration:.035,gain:(event.gain ?? .026)*.55,pan:event.pan ?? 0}, at + .018, nodes);
  }

  const schedulers = { piano, pad, pluck, digital, chime, puff, tick, whoosh, pop, ratchet, fill, doors, latch };

  function stop() {
    if (!playback) return;
    playback.nodes.forEach(safeStop);
    playback.master.gain.cancelScheduledValues(playback.ctx.currentTime);
    playback.master.gain.setTargetAtTime(.0001, playback.ctx.currentTime, .02);
    playback = null;
  }

  function play(version, duration, layerVolumes = []) {
    stop();
    const ctx = getContext();
    const start = ctx.currentTime + .06;
    const input = ctx.createGain();
    const master = ctx.createGain();
    const dry = ctx.createGain();
    const convolver = ctx.createConvolver();
    const wet = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    input.gain.value = .95;
    master.gain.value = 1;
    dry.gain.value = .88;
    wet.gain.value = .18;
    convolver.buffer = impulse(ctx);
    input.connect(dry).connect(master);
    input.connect(convolver).connect(wet).connect(master);
    master.connect(compressor).connect(ctx.destination);
    const nodes = [];
    const layerGains = version.layers.map((layer, index) => {
      const gain = ctx.createGain();
      gain.gain.value = layerVolumes[index] ?? 1;
      gain.connect(input);
      layer.events.forEach(event => {
        const schedule = schedulers[event.kind];
        if (schedule) schedule(ctx, gain, event, start + event.time, nodes);
      });
      return gain;
    });
    playback = { ctx, start, duration, nodes, master, layerGains, versionId: version.id };
    return playback;
  }

  function setLayerGain(index, value) {
    const gain = playback?.layerGains[index];
    if (!gain) return;
    gain.gain.cancelScheduledValues(playback.ctx.currentTime);
    gain.gain.setTargetAtTime(Math.max(0, Math.min(1.5, value)), playback.ctx.currentTime, .015);
  }

  function state() {
    if (!playback) return null;
    const elapsed = Math.max(0, playback.ctx.currentTime - playback.start);
    return {
      elapsed,
      duration: playback.duration,
      versionId: playback.versionId,
      layerVolumes: playback.layerGains.map(gain => gain.gain.value),
      ended: elapsed >= playback.duration,
    };
  }

  window.SoundtrackEngine = { play, stop, state, setLayerGain, midiToFrequency };
})();
