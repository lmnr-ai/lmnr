const STORAGE_KEY = 'arabesque-acoustic-effect-tuning-v1';
const player = document.querySelector('#player');
const status = document.querySelector('#status');
const nowPlaying = document.querySelector('#nowPlaying');
const fullButton = document.querySelector('#renderFull');
const panelTemplate = document.querySelector('#panelTemplate');
let config;
let tuning;
let revision = 0;

const clone = value => JSON.parse(JSON.stringify(value));
const setStatus = message => { status.textContent = message; };
const save = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning));
  revision++;
  setStatus('Edits saved. Full track needs a fresh render.');
  fullButton.textContent = '▶ render + play updated track';
};

function format(control, value) {
  if (control.unit === 'percent') return `${Math.round(value * 100)}%`;
  if (control.unit === 'semitones') return `${value > 0 ? '+' : ''}${value} st`;
  return `${Number(value).toFixed(control.step < .1 ? 2 : 1)}×`;
}

function controlElement(group, control) {
  const wrapper = document.createElement('div');
  wrapper.className = 'control';
  const id = `${group}-${control.key}`;
  wrapper.innerHTML = `<label for="${id}">${control.label}</label><output></output><input id="${id}" type="range" min="${control.min}" max="${control.max}" step="${control.step}"><small>${control.help}</small>`;
  const input = wrapper.querySelector('input');
  const output = wrapper.querySelector('output');
  input.value = tuning[group][control.key];
  const update = () => {
    tuning[group][control.key] = Number(input.value);
    output.textContent = format(control, Number(input.value));
  };
  update();
  input.addEventListener('input', update);
  input.addEventListener('change', save);
  input.addEventListener('pointerup', () => input.blur());
  return wrapper;
}

function resetGroup(group, controls) {
  tuning[group] = clone(config.defaults[group]);
  const host = group === 'mix' ? document.querySelector('#mixControls') : document.querySelector(`[data-effect="${group}"] .controls`);
  host.replaceChildren(...controls.map(control => controlElement(group, control)));
  save();
}

async function render(payload, label, button) {
  const startedAt = revision;
  document.querySelectorAll('button').forEach(item => { item.disabled = true; });
  player.pause();
  nowPlaying.textContent = label;
  setStatus(payload.mode === 'full' ? 'Rendering the complete mastered track… this can take 15–40 seconds.' : `Rendering isolated ${label.toLowerCase()}…`);
  try {
    const response = await fetch('/api/render', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({...payload, tuning})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Render failed');
    player.src = `${result.audio}?play=${Date.now()}`;
    let autoplayed = true;
    try { await player.play(); } catch { autoplayed = false; }
    const stale = revision !== startedAt;
    setStatus(`${result.cached ? 'Loaded cached render' : `Rendered in ${result.renderSeconds}s`}.${autoplayed ? '' : ' Ready — press play in the transport.'}${stale ? ' Controls changed during rendering; render again for the newest edits.' : ''}`);
    if (payload.mode === 'full' && !stale) fullButton.textContent = '↻ render + replay full track';
  } catch (error) {
    nowPlaying.textContent = 'Render failed';
    setStatus(error instanceof Error ? error.message : String(error));
  } finally {
    document.querySelectorAll('button').forEach(item => { item.disabled = false; });
    button?.blur();
  }
}

async function initialize() {
  const response = await fetch('/api/config');
  config = await response.json();
  try {
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY));
    tuning = clone(config.defaults);
    for (const group of Object.keys(tuning)) Object.assign(tuning[group], persisted?.[group] ?? {});
  } catch { tuning = clone(config.defaults); }

  document.querySelector('#mixControls').append(...config.mixControls.map(control => controlElement('mix', control)));
  const panels = document.querySelector('#effectPanels');
  config.panels.forEach((panel, index) => {
    const fragment = panelTemplate.content.cloneNode(true);
    const article = fragment.querySelector('article');
    article.dataset.effect = panel.id;
    article.querySelector('.panel-number').textContent = String(index + 1).padStart(2, '0');
    article.querySelector('h3').textContent = panel.label;
    article.querySelector('.description').textContent = panel.description;
    article.querySelector('.used-for').textContent = panel.usedFor;
    article.querySelector('.controls').append(...panel.controls.map(control => controlElement(panel.id, control)));
    article.querySelector('.reset').addEventListener('click', () => resetGroup(panel.id, panel.controls));
    article.querySelector('.audition').addEventListener('click', event => render({mode: 'effect', effect: panel.id}, panel.label, event.currentTarget));
    panels.append(fragment);
  });

  document.querySelector('[data-reset="mix"]').addEventListener('click', () => resetGroup('mix', config.mixControls));
  document.querySelector('#resetAll').addEventListener('click', () => {
    tuning = clone(config.defaults);
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  });
  document.querySelector('#exportSettings').addEventListener('click', () => {
    const blob = new Blob([`${JSON.stringify(tuning, null, 2)}\n`], {type: 'application/json'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'arabesque-acoustic-tuning.json';
    link.click();
    URL.revokeObjectURL(link.href);
  });
  fullButton.addEventListener('click', event => render({mode: 'full'}, 'Arabesque Acoustic — full track', event.currentTarget));
  window.addEventListener('keydown', event => {
    if (event.code !== 'Space' || event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    if (player.src) player.paused ? player.play() : player.pause();
  });
}

initialize().catch(error => setStatus(error instanceof Error ? error.message : String(error)));
