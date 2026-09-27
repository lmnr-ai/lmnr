const studies = window.ANIMATION_SOUNDTRACK_STUDIES ?? [];
const app = document.querySelector("#app");
const selectedVersions = Object.fromEntries(studies.map(study => [study.id, study.versions[0].id]));
const layerMixes = Object.fromEntries(studies.flatMap(study => study.versions.map(version => [version.id, version.layers.map((_, index) => index === 0 ? .65 : 1)])));
let selectedStudyId = studies[0]?.id;
let frameId = null;

const COLORS = {
  gold: "#efd36f",
  sky: "#9bdce7",
  coral: "#f49b79",
  violet: "#c8b1ed",
  mint: "#a9dfbd",
};

function selectedStudy() {
  return studies.find(study => study.id === selectedStudyId);
}

function selectedVersion() {
  const study = selectedStudy();
  return study.versions.find(version => version.id === selectedVersions[study.id]) ?? study.versions[0];
}

function noteName(midi) {
  const names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function eventName(event) {
  if (event.label) return event.label;
  if (event.notes?.length) return `${event.kind} · ${event.notes.map(noteName).join(" ")}`;
  if (event.note !== undefined) return `${event.kind} · ${noteName(event.note)}`;
  return event.kind;
}

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function eventBlock(event, layer, duration) {
  const left = event.time / duration * 100;
  const width = Math.max(event.duration / duration * 100, 1.15);
  const name = eventName(event);
  return `<button class="event color-${layer.color}" data-event-start="${event.time}" data-event-end="${event.time + event.duration}" data-event-label="${escapeAttribute(name)}" style="--left:${left}%;--width:${width}%" title="${escapeAttribute(name)} · ${event.time.toFixed(3)}s"><span>${name}</span></button>`;
}

function renderTimeline(study, version) {
  const mix = layerMixes[version.id];
  return version.layers.map((layer, index) => `
    <div class="track-row">
      <div class="track-info">
        <span class="track-dot color-${layer.color}"></span>
        <div class="track-copy"><strong>${layer.name}</strong><small>${layer.role}</small></div>
        <label class="layer-volume"><span data-layer-volume-value="${index}">${Math.round(mix[index] * 100)}%</span><input data-layer-volume="${index}" type="range" min="0" max="150" step="1" value="${Math.round(mix[index] * 100)}" aria-label="${escapeAttribute(layer.name)} volume"></label>
      </div>
      <div class="track-lane">${layer.events.map(event => eventBlock(event, layer, study.duration)).join("")}</div>
    </div>`).join("");
}

function render() {
  if (!studies.length) {
    app.innerHTML = "<p>No soundtrack studies loaded.</p>";
    return;
  }
  stop();
  const study = selectedStudy();
  const version = selectedVersion();
  const eventCount = version.layers.reduce((total, layer) => total + layer.events.length, 0);

  app.innerHTML = `<main>
    <header class="site-header">
      <div><p class="eyebrow">SYNTHESIZED TO PICTURE</p><h1>animation soundtrack studies</h1></div>
      <div class="header-side"><nav><a href="../song-studio/index.html">song studio</a><a href="../soundboard/index.html">soundboard</a><a href="../sound-synth/index.html">signal lab</a></nav><p class="header-note">Three animations. Three musical directions each. No samples or stock music.</p></div>
    </header>

    <nav class="animation-tabs" aria-label="Animation studies">
      ${studies.map(item => `<button data-study="${item.id}" class="${item.id === study.id ? "selected" : ""}"><span>${item.animation}</span><strong>${item.title}</strong><small>${item.duration} seconds</small></button>`).join("")}
    </nav>

    <section class="study-heading">
      <div><p class="eyebrow">${study.animation.toUpperCase()} · FULL SOUNDTRACK</p><h2>${study.title}</h2><p>${study.visualSummary}</p></div>
      <div class="study-stats"><span><strong>${version.layers.length}</strong> layers</span><span><strong>${eventCount}</strong> cues</span><span><strong>${version.key}</strong> key</span></div>
    </section>

    <section class="workspace">
      <aside class="visual-study">
        <div class="section-label"><span>01</span><h3>picture study</h3></div>
        <figure class="hero-frame"><img data-hero-frame src="${study.keyframes[0].image}" alt="${study.keyframes[0].label}"><figcaption><span data-frame-time>${study.keyframes[0].time.toFixed(1)}s</span><strong data-frame-label>${study.keyframes[0].label}</strong></figcaption></figure>
        <div class="keyframes">${study.keyframes.map((keyframe, index) => `<button data-keyframe="${index}" class="${index === 0 ? "active" : ""}"><img src="${keyframe.image}" alt=""><span>${keyframe.time.toFixed(1)}s</span></button>`).join("")}</div>
        <p class="picture-note">Reference frames were rendered from the animation source. The score follows the authored timeline between these landmarks.</p>
      </aside>

      <section class="score-study">
        <div class="section-label"><span>02</span><h3>choose a direction</h3></div>
        <div class="version-tabs">${study.versions.map((item, index) => `<button data-version="${item.id}" class="${item.id === version.id ? "selected" : ""}"><span>${index + 1}</span><div><strong>${item.title}</strong><small>${item.direction}</small></div></button>`).join("")}</div>
        <article class="version-intro"><div><p class="eyebrow">${version.direction.toUpperCase()} · ${version.tempo} BPM · ${version.key.toUpperCase()}</p><h3>${version.title}</h3><p>${version.description}</p></div><button class="play-button" data-play>▶ play full soundtrack <kbd>space</kbd></button></article>

        <div class="transport"><span data-current>0.0</span><div class="progress"><span data-progress></span></div><span>${study.duration.toFixed(1)}</span></div>
        <div class="active-cues"><span>NOW MATCHING</span><div data-active-cues>waiting for first motion</div></div>
        <div class="ruler"><span>0</span><span>${(study.duration * .25).toFixed(1)}</span><span>${(study.duration * .5).toFixed(1)}</span><span>${(study.duration * .75).toFixed(1)}</span><span>${study.duration.toFixed(1)}s</span></div>
        <div class="timeline" data-timeline>${renderTimeline(study, version)}<div class="playhead" data-playhead></div></div>
      </section>
    </section>

    <section class="layer-notes">
      <div class="section-label"><span>03</span><h3>component parts</h3></div>
      <div class="layer-grid">${version.layers.map(layer => `<article><span class="swatch color-${layer.color}"></span><h4>${layer.name}</h4><p>${layer.role}</p><small>${layer.events.length} cues</small></article>`).join("")}</div>
    </section>
  </main>`;

  bind();
}

function bind() {
  document.querySelectorAll("[data-study]").forEach(button => button.addEventListener("click", () => {
    selectedStudyId = button.dataset.study;
    render();
  }));
  document.querySelectorAll("[data-version]").forEach(button => button.addEventListener("click", () => {
    selectedVersions[selectedStudyId] = button.dataset.version;
    render();
  }));
  document.querySelector("[data-play]").addEventListener("click", toggle);
  document.querySelectorAll("[data-keyframe]").forEach(button => button.addEventListener("click", () => showKeyframe(Number(button.dataset.keyframe))));
  document.querySelectorAll("[data-layer-volume]").forEach(slider => {
    slider.addEventListener("input", () => {
      const index = Number(slider.dataset.layerVolume);
      const value = Number(slider.value) / 100;
      layerMixes[selectedVersion().id][index] = value;
      document.querySelector(`[data-layer-volume-value="${index}"]`).textContent = `${slider.value}%`;
      window.SoundtrackEngine.setLayerGain(index, value);
    });
    slider.addEventListener("pointerup", () => slider.blur());
    slider.addEventListener("change", () => slider.blur());
  });
}

function showKeyframe(index) {
  const keyframe = selectedStudy().keyframes[index];
  document.querySelector("[data-hero-frame]").src = keyframe.image;
  document.querySelector("[data-hero-frame]").alt = keyframe.label;
  document.querySelector("[data-frame-time]").textContent = `${keyframe.time.toFixed(1)}s`;
  document.querySelector("[data-frame-label]").textContent = keyframe.label;
  document.querySelectorAll("[data-keyframe]").forEach((button, buttonIndex) => button.classList.toggle("active", buttonIndex === index));
}

function stop(reset = true) {
  cancelAnimationFrame(frameId);
  frameId = null;
  window.SoundtrackEngine?.stop();
  if (!reset) return;
  document.querySelectorAll("[data-play]").forEach(button => button.innerHTML = "▶ play full soundtrack <kbd>space</kbd>");
  document.querySelectorAll("[data-progress]").forEach(progress => progress.style.width = "0%");
  document.querySelectorAll("[data-playhead]").forEach(playhead => playhead.style.removeProperty("left"));
  document.querySelectorAll("[data-current]").forEach(time => time.textContent = "0.0");
  document.querySelectorAll("[data-active-cues]").forEach(cues => cues.textContent = "waiting for first motion");
  document.querySelectorAll("[data-event-start]").forEach(event => event.classList.remove("active"));
}

function toggle() {
  if (window.SoundtrackEngine.state()) {
    stop();
    return;
  }
  const study = selectedStudy();
  const version = selectedVersion();
  window.SoundtrackEngine.play(version, study.duration, layerMixes[version.id]);
  document.querySelector("[data-play]").innerHTML = "■ stop soundtrack <kbd>space</kbd>";
  update();
}

function update() {
  const state = window.SoundtrackEngine.state();
  if (!state || state.ended) {
    stop();
    return;
  }
  const study = selectedStudy();
  const percent = Math.min(100, state.elapsed / study.duration * 100);
  document.querySelector("[data-progress]").style.width = `${percent}%`;
  document.querySelector("[data-current]").textContent = state.elapsed.toFixed(1);

  const timeline = document.querySelector("[data-timeline]");
  const lane = timeline.querySelector(".track-lane");
  const timelineBox = timeline.getBoundingClientRect();
  const laneBox = lane.getBoundingClientRect();
  document.querySelector("[data-playhead]").style.left = `${laneBox.left - timelineBox.left + laneBox.width * percent / 100}px`;

  const activeLabels = [];
  document.querySelectorAll("[data-event-start]").forEach(element => {
    const active = state.elapsed >= Number(element.dataset.eventStart) && state.elapsed < Number(element.dataset.eventEnd);
    element.classList.toggle("active", active);
    if (active && !/^(Harmony|Harmonic|Quiet machine|Piano narrative)/.test(element.dataset.eventLabel)) activeLabels.push(element.dataset.eventLabel);
  });
  document.querySelector("[data-active-cues]").textContent = [...new Set(activeLabels)].slice(0, 4).join("  +  ") || "continuous musical bed";

  let keyframeIndex = 0;
  study.keyframes.forEach((keyframe, index) => { if (state.elapsed >= keyframe.time) keyframeIndex = index; });
  const activeKeyframe = document.querySelector(`[data-keyframe="${keyframeIndex}"]`);
  if (!activeKeyframe.classList.contains("active")) showKeyframe(keyframeIndex);
  frameId = requestAnimationFrame(update);
}

window.addEventListener("keydown", event => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if (event.code === "Space" && document.activeElement?.tagName !== "BUTTON") {
    event.preventDefault();
    toggle();
  }
  if (/^[1-3]$/.test(event.key)) {
    const version = selectedStudy().versions[Number(event.key) - 1];
    if (version) {
      selectedVersions[selectedStudyId] = version.id;
      render();
    }
  }
});

render();
