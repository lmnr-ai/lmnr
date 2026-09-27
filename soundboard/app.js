const sounds = [
  "blop-blop-bubble.wav",
  "blop-bubble.wav",
  "chalk-slide.wav",
  "click.wav",
  "coin-chime.wav",
  "error-chime.wav",
  "halo-reveal.wav",
  "lakeside-water.wav",
  "pop-pop-progress.wav",
  "quick-swipe-whoosh.wav",
  "quick-whoosh.wav",
  "vwoomp-whoosh.wav",
  "warning-chime.wav",
  "b-t-ping-piano.wav",
  "camera-whirring.wav",
  "cheap-clicking.wav",
  "exhale.wav",
  "muffled-vanish.wav",
  "deep-camera-whoosh.wav",
  "deep-camera-whoosh-short-1.25s.wav",
  "deep-camera-whoosh-long-2.75s.wav",
  "deep-camera-whoosh-long-3.5s.wav",
  "zoom-out-whoosh.wav",
  "left-to-right-whoosh.wav",
  "right-to-left-whoosh.wav",
  "arabesque-air-current.wav",
  "pillowy-air-cotton-drift.wav",
  "pillowy-air-velvet-bloom.wav",
  "pillowy-air-cloud-lift.wav",
  "pillowy-air-soft-exhale.wav",
  "ultrasoft-air-deep-fleece.wav",
  "ultrasoft-air-cloud-cushion.wav",
  "ultrasoft-air-warm-breath.wav",
  "ultrasoft-air-feather-lift.wav",
  "ultrasoft-air-distant-pillow.wav",
  "softness-6-satin-rise.wav",
  "softness-6.5-satin-retreat.wav",
  "softness-7-downy-pass.wav",
  "softness-7.5-rounded-bloom.wav",
  "softness-8-feather-hush.wav",
  "arabesque-typing-current.wav",
  "typing-soft-felt.wav",
  "typing-muted-laptop.wav",
  "typing-warm-wood.wav",
  "typing-gentle-fingertips.wav",
  "keyboard-quiet-scissor.wav",
  "keyboard-crisp-scissor.wav",
  "keyboard-muted-mechanical.wav",
  "keyboard-soft-membrane.wav",
  "keyboard-low-profile.wav",
  { name: "synth · bubble rise reveal", synth: "bubble-rise" },
  { name: "zoom out · airy retreat", synth: "zoom-air" },
  { name: "zoom out · tonal shrink", synth: "zoom-tone" },
  { name: "zoom out · distant steps", synth: "zoom-steps" },
];

let audioContext;

function makeNoiseBuffer(seconds) {
  const buffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * seconds), audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  let low = 0;
  for (let index = 0; index < data.length; index++) {
    low = low * .94 + (Math.random() * 2 - 1) * .06;
    data[index] = low * 3;
  }
  return buffer;
}

function playBubbleRise() {
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") audioContext.resume();

  const now = audioContext.currentTime + .01;
  const duration = .17;
  const spacing = .055;
  const pitchRatios = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];
  const master = audioContext.createGain();
  master.gain.value = .72;
  master.connect(audioContext.destination);

  pitchRatios.forEach((ratio, index) => {
    const at = now + index * spacing;
    const oscillator = audioContext.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(391 * ratio, at);
    oscillator.frequency.exponentialRampToValueAtTime(327 * ratio, at + duration);

    const envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.exponentialRampToValueAtTime(.18, at + .015);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);

    const pan = audioContext.createStereoPanner();
    pan.pan.value = .35;
    oscillator.connect(envelope).connect(pan).connect(master);
    oscillator.start(at);
    oscillator.stop(at + duration + .02);
  });

  return duration + spacing * (pitchRatios.length - 1);
}

function playZoomAir() {
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") audioContext.resume();
  const now = audioContext.currentTime + .01;
  const duration = .78;
  const noise = audioContext.createBufferSource();
  noise.buffer = makeNoiseBuffer(duration);

  const filter = audioContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = .72;
  filter.frequency.setValueAtTime(5200, now);
  filter.frequency.exponentialRampToValueAtTime(360, now + duration);

  const envelope = audioContext.createGain();
  envelope.gain.setValueAtTime(.0001, now);
  envelope.gain.exponentialRampToValueAtTime(.24, now + .025);
  envelope.gain.exponentialRampToValueAtTime(.0001, now + duration);

  const pan = audioContext.createStereoPanner();
  pan.pan.setValueAtTime(-.16, now);
  pan.pan.linearRampToValueAtTime(.08, now + duration);
  noise.connect(filter).connect(envelope).connect(pan).connect(audioContext.destination);
  noise.start(now);
  noise.stop(now + duration);
  return duration;
}

function playZoomTone() {
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") audioContext.resume();
  const now = audioContext.currentTime + .01;
  const duration = .62;
  const master = audioContext.createGain();
  master.gain.setValueAtTime(.0001, now);
  master.gain.exponentialRampToValueAtTime(.16, now + .012);
  master.gain.exponentialRampToValueAtTime(.0001, now + duration);
  master.connect(audioContext.destination);

  [1, 1.5, 2.02].forEach((ratio, index) => {
    const oscillator = audioContext.createOscillator();
    oscillator.type = index === 0 ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(880 * ratio, now);
    oscillator.frequency.exponentialRampToValueAtTime(196 * ratio, now + duration);
    const level = audioContext.createGain();
    level.gain.value = 1 / (index + 1);
    oscillator.connect(level).connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
  });
  return duration;
}

function playZoomSteps() {
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") audioContext.resume();
  const now = audioContext.currentTime + .01;
  const offsets = [0, .065, .14, .23, .335, .455, .59];
  offsets.forEach((offset, index) => {
    const at = now + offset;
    const duration = .11;
    const oscillator = audioContext.createOscillator();
    oscillator.type = "sine";
    const frequency = 1180 * .81 ** index;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * .78, at + duration);
    const envelope = audioContext.createGain();
    const peak = .16 * .72 ** index;
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.exponentialRampToValueAtTime(peak, at + .008);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(envelope).connect(audioContext.destination);
    oscillator.start(at);
    oscillator.stop(at + duration + .02);
  });
  return offsets.at(-1) + .11;
}

const synthPlayers = {
  "bubble-rise": playBubbleRise,
  "zoom-air": playZoomAir,
  "zoom-tone": playZoomTone,
  "zoom-steps": playZoomSteps,
};

const columnKeys = ["a", "o", "e", "u", "i"];
const columns = columnKeys.length;
const rowCount = Math.ceil(sounds.length / columns);
const grid = document.querySelector("#grid");
const status = document.querySelector("#status");
let selectedRow = 0;

function hueFromName(name) {
  let hash = 2166136261;
  for (const character of name) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}

const buttons = sounds.map((sound, index) => {
  const button = document.createElement("button");
  const name = typeof sound === "string" ? sound.replace(/\.wav$/i, "") : sound.name;

  button.className = "sound";
  button.style.setProperty("--hue", hueFromName(name));
  button.type = "button";
  button.textContent = name;
  button.dataset.row = String(Math.floor(index / columns));
  button.setAttribute("aria-label", `Play ${name}`);
  button.addEventListener("click", () => {
    selectedRow = Number(button.dataset.row);
    renderSelection();
    playSound(index);
  });

  grid.append(button);
  return button;
});

function renderSelection() {
  buttons.forEach((button) => {
    const selected = Number(button.dataset.row) === selectedRow;
    button.classList.toggle("selected-row", selected);
    button.setAttribute("aria-current", selected ? "true" : "false");
  });
  status.textContent = `row ${selectedRow + 1} of ${rowCount}`;
}

function playSound(index) {
  const sound = sounds[index];
  const button = buttons[index];
  if (!sound || !button) return;

  const name = typeof sound === "string" ? sound.replace(/\.wav$/i, "") : sound.name;
  button.classList.add("playing");
  status.textContent = `playing ${name}`;

  const stopPlaying = () => button.classList.remove("playing");
  if (typeof sound === "object" && synthPlayers[sound.synth]) {
    const playTime = synthPlayers[sound.synth]();
    window.setTimeout(stopPlaying, playTime * 1000);
    return;
  }

  const audio = new Audio(`assets/${encodeURIComponent(sound)}`);
  audio.addEventListener("ended", stopPlaying, { once: true });
  audio.addEventListener("error", stopPlaying, { once: true });
  audio.play().catch(stopPlaying);
}

window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;

  const key = event.key.toLowerCase();
  if (key === "j" || key === "k") {
    event.preventDefault();
    const direction = key === "j" ? 1 : -1;
    selectedRow = Math.min(rowCount - 1, Math.max(0, selectedRow + direction));
    renderSelection();
    return;
  }

  const column = columnKeys.indexOf(key);
  if (column !== -1) {
    event.preventDefault();
    playSound(selectedRow * columns + column);
  }
});

renderSelection();
