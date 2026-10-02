import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Subtitles as Ultimate2Subtitles} from '../micro-17/Subtitles';
import {Subtitles as CostSubtitles} from '../micro-16/Subtitles';
import {Subtitles as FlowSubtitles} from '../introducing-flow-1/Subtitles';
import {Subtitles as IssuesSubtitles} from '../micro-20/Subtitles';
import {NARRATION} from '../micro-20/narration';
import {CLIP_KEYS as ULTIMATE2_KEYS} from '../micro-17/timeline';
import {CLIP_KEYS as COST_KEYS} from '../micro-16/timeline';
import {FLOW_CLIP_KEYS} from '../introducing-flow-1/timeline';
import {MICRO_15_SUBTITLE_KEYS} from '../micro-15/timeline';
import {sampleMicro17} from '../micro-17/sample';
import {sampleMicro16} from '../micro-16/sample';
import {sampleIntroducingFlow1} from '../introducing-flow-1/sample';
import {Ultimate3Scene} from './Scene';
import {CONCLUSION_SUBTITLES} from './Subtitles';
import {chapterSchedule, sampleUltimate3, ultimate3DurationFrames} from './sample';
import {normalizeSettings, ULTIMATE_3_DEFAULTS} from './settings';

const subtitleKeys = (keys: readonly string[]) => keys.filter(key => key.startsWith('subtitle'));
const allHalf = (keys: readonly string[]) => Object.fromEntries(keys.map(key => [key, .5]));

const copy = [
  'You build agents.',
  'Every time your agent runs, it leaves a trace.',
  'When your agent fails,',
  'the trace can tell you why.',
  'The insights you need to make your agents efficient, fast, and reliable are hidden across thousands of traces.',
  'If only someone could read them all.',
  'Cheap LLMs can read trace efficiently',
  'but fail to find crucial issues.',
  'More powerful LLMs can find deep obscure issues',
  'but the costs are unsustainable.',
  'Introducing flow-1, our model specialized for trace analysis.',
  'Matching Sonnet-5 in intelligence.',
  'At 2% of the cost.',
  'flow-1 powers Signals, our agent build to analyze traces at scale.',
  ...Object.values(NARRATION),
] as const;

test('Ultimate 3 reuses source subtitles with lowercase flow-1 without duplicating chapter layers', () => {
  const markup = [
    renderToStaticMarkup(createElement(Ultimate2Subtitles, {progress: allHalf(ULTIMATE2_KEYS) as any})),
    renderToStaticMarkup(createElement(CostSubtitles, {progress: allHalf(COST_KEYS) as any})),
    renderToStaticMarkup(createElement(FlowSubtitles, {progress: allHalf(FLOW_CLIP_KEYS) as any, modelName: 'flow-1'})),
    ...Object.keys(NARRATION).map(narration => renderToStaticMarkup(createElement(IssuesSubtitles, {narration: narration as keyof typeof NARRATION, opacity: 1}))),
  ].join('');
  for (const text of copy) assert.ok(markup.includes(text), text);

  const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8');
  assert.equal((scene.match(/<Micro17Scene /g) ?? []).length, 1);
  assert.equal((scene.match(/<Micro20Scene /g) ?? []).length, 2, 'mutually exclusive Issues and Conclusion both suppress native subtitles');
  assert.equal((scene.match(/showSubtitles=\{false\}/g) ?? []).length, 4);
  assert.equal((scene.match(/<FlowSubtitles /g) ?? []).length, 1);
  assert.equal((scene.match(/<Subtitles progress=\{cost\.progress\}/g) ?? []).length, 1);
});

test('Ultimate 3 lowercases the title, benchmark, engine and captions while standalone copy is unchanged', () => {
  const settings = ULTIMATE_3_DEFAULTS;
  const flowStart = chapterSchedule(settings).find(chapter => chapter.id === 'flow')!.start;
  const markup = renderToStaticMarkup(createElement(Ultimate3Scene, {
    sample: sampleUltimate3(flowStart + 3, settings), settings,
  }));
  assert.match(markup, /class="flow1-title">flow-1<\/div>/);
  assert.match(markup, /class="flow1-module"[^>]*>flow-1<\/div>/);
  assert.match(markup, />flow-1<\/span>/);
  assert.ok(markup.includes('Introducing flow-1, our model specialized for trace analysis.'));
  assert.ok(markup.includes('flow-1 powers Signals, our agent build to analyze traces at scale.'));
  assert.ok(!markup.includes('Flow-1'));
  const standalone = renderToStaticMarkup(createElement(FlowSubtitles, {progress: allHalf(FLOW_CLIP_KEYS) as any}));
  assert.ok(standalone.includes('Introducing Flow-1,'));
});

test('unchanged subtitle tracks retain source-native progress under their approved global offsets', () => {
  const settings = ULTIMATE_3_DEFAULTS;
  const schedule = chapterSchedule(settings);
  const cases = [
    {start: schedule[0].start, offset: 0, times: [.45, 9.7, 14.5], integrated: (t: number) => sampleUltimate3(t, settings).ultimate2!.progress, source: (t: number) => sampleMicro17(t, settings.ultimate2.timing).progress},
    {start: schedule[1].start, offset: 0, times: [.45, 8, 14.999], integrated: (t: number) => sampleUltimate3(t, settings).cost!.progress, source: (t: number) => sampleMicro16(t - schedule[1].start, settings.cost.controls, settings.cost.timing).progress},
    {start: schedule[2].start, offset: 1.2, times: [1.2 + .45, 1.2 + 6.5, 12.999], integrated: (t: number) => sampleUltimate3(t, settings).flow!.playback.progress, source: (t: number) => sampleIntroducingFlow1(t - schedule[2].start - 1.2).progress},

  ] as const;
  const keys = [subtitleKeys(ULTIMATE2_KEYS), subtitleKeys(COST_KEYS), subtitleKeys(FLOW_CLIP_KEYS), [...MICRO_15_SUBTITLE_KEYS]];
  cases.forEach((chapter, chapterIndex) => chapter.times.forEach(local => {
    const global = chapter.start + local;
    const actual = chapter.integrated(global) as Record<string, number>;
    const expected = chapter.source(global) as Record<string, number>;
    for (const key of keys[chapterIndex]) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-12, `${key} at ${global}`);
  }));

  assert.equal(sampleUltimate3(schedule[2].start + 1.199, settings).flow!.playback.progress.subtitleIntroducing, 0, 'Flow bridge has no subtitle');
  assert.equal(sampleUltimate3(schedule[3].start + .499, settings).issues!.entering, true, 'Issues lead-in scrolls before native source20 begins');
  assert.equal(sampleUltimate3(schedule[1].start, settings).chapter, 'cost');
  assert.equal(sampleUltimate3(schedule[2].start, settings).chapter, 'flow');
  assert.equal(sampleUltimate3(schedule[3].start, settings).chapter, 'issues');
  assert.equal(sampleUltimate3(schedule[4].start, settings).chapter, 'conclusion');
});

test('legacy settings restore missing subtitle defaults and reverse/arbitrary seeks stay deterministic', () => {
  const legacy: any = structuredClone(ULTIMATE_3_DEFAULTS);
  for (const key of subtitleKeys(ULTIMATE2_KEYS)) delete legacy.ultimate2.timing[key];
  for (const key of subtitleKeys(COST_KEYS)) delete legacy.cost.timing[key];
  for (const key of subtitleKeys(FLOW_CLIP_KEYS)) delete legacy.flow.timing[key];
  for (const key of MICRO_15_SUBTITLE_KEYS) delete legacy.issues.timing[key];
  const normalized = normalizeSettings(legacy);
  const defaults = normalizeSettings(ULTIMATE_3_DEFAULTS);
  for (const key of subtitleKeys(ULTIMATE2_KEYS)) assert.deepEqual((normalized.ultimate2.timing as any)[key], (defaults.ultimate2.timing as any)[key]);
  for (const key of subtitleKeys(COST_KEYS)) assert.deepEqual((normalized.cost.timing as any)[key], (defaults.cost.timing as any)[key]);
  for (const key of subtitleKeys(FLOW_CLIP_KEYS)) assert.deepEqual((normalized.flow.timing as any)[key], (defaults.flow.timing as any)[key]);
  for (const key of MICRO_15_SUBTITLE_KEYS) assert.deepEqual((normalized.issues.timing as any)[key], (defaults.issues.timing as any)[key]);

  const times = [0, 19.15, 34.9, 40.2, 47.2, 50.2, 58.2];
  const forward = times.map(time => sampleUltimate3(time, normalized));
  for (const index of [6, 2, 5, 0, 4, 1, 3]) assert.deepEqual(sampleUltimate3(times[index], normalized), forward[index]);
});

test('conclusion subtitles use exact copy in stage order and never render on the Issues scroll', () => {
  const settings = ULTIMATE_3_DEFAULTS;
  const conclusionStart = chapterSchedule(settings)[4].start;
  const render = (time: number) => renderToStaticMarkup(createElement(Ultimate3Scene, {sample: sampleUltimate3(time, settings), settings}));
  const first = render(conclusionStart + 1.5);
  const second = render(conclusionStart + 2.5);
  const issuesTodo = render(chapterSchedule(settings)[3].start + .25);

  assert.deepEqual(Object.values(CONCLUSION_SUBTITLES), [
    'Unlock the insights hiding in millions of agent traces',
    'With Laminar',
  ]);
  assert.ok(first.includes(CONCLUSION_SUBTITLES.placeholder));
  assert.ok(!first.includes(CONCLUSION_SUBTITLES.logo), 'first stage must not overlap second caption');
  assert.ok(second.includes(CONCLUSION_SUBTITLES.logo));
  assert.ok(!second.includes(CONCLUSION_SUBTITLES.placeholder), 'second stage must not overlap first caption');
  for (const caption of Object.values(CONCLUSION_SUBTITLES)) assert.ok(!issuesTodo.includes(caption));
  assert.doesNotMatch(issuesTodo, /TODO: transition/);
  assert.match(issuesTodo, /data-shared-camera="true"/);
});

test('conclusion subtitles inherit default, retimed, held, reverse, and instant card-stage boundaries', () => {
  const defaults = ULTIMATE_3_DEFAULTS;
  const defaultStart = chapterSchedule(defaults)[4].start;
  assert.ok(Math.abs(defaultStart - 59.21818181818182) < 1e-12);
  assert.equal(sampleUltimate3(defaultStart + .5, defaults).conclusion, 'placeholder');
  assert.equal(sampleUltimate3(defaultStart + 1.5, defaults).conclusion, 'placeholder');
  assert.equal(sampleUltimate3(defaultStart + 2, defaults).conclusion, 'logo');
  assert.equal(sampleUltimate3(defaultStart + 2.5, defaults).conclusion, 'logo');
  assert.equal(sampleUltimate3(defaultStart + 3.5, defaults).conclusion, 'logo');
  assert.equal(sampleUltimate3(1e9, defaults).conclusion, 'logo');
  assert.equal(ultimate3DurationFrames(defaults), 1897);

  const retimed = normalizeSettings({...defaults, conclusion: {placeholder: {at: .25, duration: 1.5}, logo: {at: 1, duration: 2}}});
  const retimedStart = chapterSchedule(retimed)[4].start;
  assert.equal(retimed.conclusion.logo.at, 1.75);
  const times = [retimedStart + 1.749, retimedStart + 1.75, 1e9];
  const forward = times.map(time => sampleUltimate3(time, retimed).conclusion);
  assert.deepEqual(forward, ['placeholder', 'logo', 'logo']);
  for (const index of [2, 0, 1]) assert.equal(sampleUltimate3(times[index], retimed).conclusion, forward[index]);

  const instant = normalizeSettings({...defaults, conclusion: {placeholder: {at: 0, duration: 0}, logo: {at: 1, duration: 0}}});
  const instantStart = chapterSchedule(instant)[4].start;
  assert.equal(instant.conclusion.logo.at, 0);
  assert.equal(sampleUltimate3(instantStart, instant).conclusion, 'logo');
});

test('conclusion subtitle styling is screen-pinned and preserves the exact logo asset and geometry', () => {
  const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  assert.match(scene, /staticFile\('micro-18\/conclusion-logo\.svg'\)/);
  assert.match(css, /\.micro18-logo\{display:block;width:252\.92657470703125px;height:43\.907466888427734px\}/);
  assert.match(css, /\.micro18-conclusion-subtitle-layer\{[^}]*position:absolute[^}]*z-index:11/);
  assert.match(css, /\.micro18-conclusion-subtitle\{[^}]*bottom:32px[^}]*max-width:calc\(100% - 64px\)[^}]*background:#000[^}]*color:#fff[^}]*font:400 24px\/normal FlowMono,monospace[^}]*text-align:center/);
});

test('Ultimate 2 subtitles escape its scene stack and stay above the shared handoff clouds', () => {
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.micro18-frame>\.micro17-composition\{isolation:auto\}/);
  assert.match(css, /\.micro18-frame>\.micro09-clouds\{[^}]*z-index:10/);
  assert.match(css, /\.micro18-frame>\.micro17-composition>\.micro17-subtitle-layer\{z-index:11\}/);
});

test('Flow subtitles are screen-space siblings above shared artwork and clouds', () => {
  const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  const worldEnd = scene.indexOf('</div>\n    {showingComparison');
  const cloudsEnd = scene.indexOf('</div>}\n    {/* The narrated cut draws');
  const subtitlesAt = scene.indexOf(': isFlow ? (flow.playback21 ? <Flow21Subtitles');
  assert.ok(worldEnd >= 0 && cloudsEnd > worldEnd && subtitlesAt > cloudsEnd,
    'subtitles must be outside both the shared world and the restored moving cloud plane');
  assert.match(css, /\.micro18-shared-scene>\.flow1-subtitle-layer\{[^}]*position:absolute[^}]*z-index:11/);
  assert.match(css, /\.micro18-frame>\.micro09-clouds\{[^}]*z-index:10/);
  assert.match(css, /\.micro18-flow-cloud-layer\{[^}]*z-index:10/);
});

test('the voiceover cut draws one verbatim script caption per line, following its phrase clips', async () => {
  const {VOICEOVER_DEFAULTS: s} = await import('./voiceover-cut');
  const {VOICEOVER_CAPTIONS, voiceoverCaptionWindows} = await import('./VoiceoverCaptions');
  const windows = voiceoverCaptionWindows(s.voiceover!);
  assert.deepEqual(windows.map(w => w.text), VOICEOVER_CAPTIONS.map(c => c.text));
  for (const [i, w] of windows.entries()) {
    const markup = renderToStaticMarkup(createElement(Ultimate3Scene, {settings: s, sample: sampleUltimate3((w.start + w.end) / 2, s)}));
    const escaped = w.text.replace(/'/g, '&#x27;');
    assert.equal((markup.match(/data-voiceover-caption/g) ?? []).length, 1, w.text);
    assert.ok(markup.includes(escaped), w.text);
    for (const layer of ['micro17-subtitle-layer', 'micro16-subtitle-layer', 'flow1-subtitle-layer', 'micro20-subtitle-layer']) assert.ok(!markup.includes(`class="${layer}"`), layer);
    assert.equal((markup.match(/class="micro18-conclusion-subtitle"/g) ?? []).length, 1);
    if (i) assert.ok(windows[i - 1].end <= w.start);
  }
  // Moving a phrase moves its caption.
  const moved = {...s, voiceover: {...s.voiceover!, phrases: {...s.voiceover!.phrases, n07: {at: 20, duration: 2}}}};
  const cheap = voiceoverCaptionWindows(moved.voiceover).find(w => w.text.startsWith('Cheap'))!;
  assert.equal(cheap.start, 20);
  assert.equal(renderToStaticMarkup(createElement(Ultimate3Scene, {settings: moved, sample: sampleUltimate3(19.8, moved)})).includes('data-voiceover-caption'), false);
  // subtitles: false is a clean export: no caption, same picture otherwise.
  const clean = normalizeSettings({...s, subtitles: false});
  const mid = (windows[0].start + windows[0].end) / 2;
  assert.equal(renderToStaticMarkup(createElement(Ultimate3Scene, {settings: clean, sample: sampleUltimate3(mid, clean)})).includes('data-voiceover-caption'), false);
});
