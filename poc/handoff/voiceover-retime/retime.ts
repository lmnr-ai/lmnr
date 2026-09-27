import {writeFileSync} from 'node:fs';
import {ULTIMATE_3_DEFAULTS, normalizeSettings, issuePostludeOffset, type Ultimate3Settings} from '../../src/experiments/micro-18/settings';
import {chapterSchedule} from '../../src/experiments/micro-18/sample';

type Clip = {at: number; duration: number; transition?: any};
type Track = Record<string, Clip>;
const s: Ultimate3Settings = structuredClone(ULTIMATE_3_DEFAULTS);
const r3 = (v: number) => Math.round(v * 1e3) / 1e3;
const set = (t: Track, key: string, at: number, duration = t[key].duration) => {
  const clip = t[key];
  t[key] = {...clip, at: r3(at), duration: r3(duration),
    ...(clip.transition?.type === 'easing' ? {transition: {...clip.transition, duration: r3(duration)}} : {})};
};
// Holds are inserted by moving every non-subtitle bar at/after T; subtitles are placed on the VO explicitly.
const shift = (t: Track, from: number, delta: number, skip: (key: string) => boolean = key => key.startsWith('subtitle')) =>
  Object.keys(t).forEach(key => !skip(key) && t[key].at >= from - 1e-6 && set(t, key, t[key].at + delta));

// Ultimate 2: longer warning hold, slower zoom out onto the grid, clouds after "thousands of traces."
const u2 = s.ultimate2.timing as Track;
shift(u2, 10.1, 1);
set(u2, 'finalZoom', u2.finalZoom.at, 3);
shift(u2, 12.3, .6);
shift(u2, 14.1, 1.13);
set(u2, 'subtitleInsights', 9.57, 16.35 - 9.57);
set(u2, 'subtitleIfOnly', 16.35, 3.8);
s.pacing.ultimate2HandoffHold = 1.65;

// Cost: animation untouched; captions move to their phrases and the tail trims just after depletion.
const cost = s.cost.timing as Track;
set(cost, 'subtitleMissIssues', 2.95, 6.2 - 2.95);
set(cost, 'subtitlePowerful', 6.2, 10.02 - 6.2);
s.pacing.costTrimEnd = 13.7;

// Flow: camera lifts under "specialized for trace analysis", benchmark holds, the cover shuts on "signals".
const flow = s.flow.timing as Track;
shift(flow, 1.9, 1.32);
shift(flow, 7.42, -.67);
set(flow, 'subtitleIntroducing', .45, 4.6 - .45);
set(flow, 'subtitleIntelligence', 4.6, 6.85 - 4.6);
set(flow, 'subtitleCost', 6.85, 10.25 - 6.85);
set(flow, 'subtitleSignals', 10.25, 4.66);
s.pacing.flowTrimEnd = 11.3;

// Issues prelude: quicker bash descent so "at scale" lands on the zoom out.
const lead = s.issues.leadIn as Clip;
s.issues.leadIn = {...lead, duration: .9, transition: {...lead.transition, duration: .9}} as any;
const pre = s.issues.preludeTiming as Track;
set(pre, 'blueBashEntry', .3, .7);
set(pre, 'blueBashStop', 1, .25);
set(pre, 'bashExpand', 1.3, .2);
set(pre, 'bashDescent', 1.45, 1.05);
set(pre, 'bashHighlight', 2.1, .55);
set(pre, 'analysisZoomOut', 2.65, 2);
set(pre, 'analysisTraceCollapse', 3.85);
set(pre, 'analysisLocalGridFade', 3.85);
set(pre, 'analysisCircleGrow', 4.85);
for (const key of ['analysisCircleFade', 'analysisAgentScaleOut']) set(pre, key, 6.75);
set(pre, 'analysisLayout', 7.2, .1);
set(pre, 'subtitleFlow', .3, 2.65 - .3);
set(pre, 'subtitleDetection', 4.65, 1.05);
s.issues.issueStart = 7.2;

// Issues postlude: clustering travel starts on "clusters", the agent window drops on "coding agent".
const post = s.issues.timing as Track;
shift(post, 1, -.65);
set(post, 'subtitleIssues', 0, .2);
set(post, 'subtitlePatterns', .2, 2.75 - .2);
set(post, 'subtitleReady', 2.75, clipEndOf(post.agentWindowExit) - 2.75);
s.issues.controls = {...s.issues.controls, timelineDuration: 6.4};
s.issues.preludeControls = {...s.issues.preludeControls, timelineDuration: 1};
function clipEndOf(c: Clip) { return c.at + c.duration; }

s.conclusion = {placeholder: {...s.conclusion.placeholder, duration: 3}, logo: {...s.conclusion.logo, at: 3, duration: 2.5}};
s.allocations = {ultimate2: 0, cost: 0, flow: 0, issues: 0, conclusion: 0};

const settings = normalizeSettings(s);
const ch = Object.fromEntries(chapterSchedule(settings).map(c => [c.id, c.start]));
const flowNative = ch.flow + settings.flow.entrySlide.duration;
const prelude = ch.issues + settings.issues.leadIn.duration, postlude = ch.issues + issuePostludeOffset(settings);

// [label, source start, source end, source speech onset, output time of that onset]
const phrases: [string, number, number, number, number][] = [
  ['You build agents.', 4.52, 5.77, 4.6, .45],
  ['Every time your agent runs, it leaves a trace.', 5.94, 8.67, 6.02, 1.9],
  ['When your agent fails,', 8.96, 10.2, 9.04, 4.62],
  ['the trace can tell you why.', 10.2, 11.61, 10.26, 6.42],
  ['The insights ... thousands of traces.', 12.17, 18.35, 12.25, 9.57],
  ['If only someone could read them all.', 18.75, 20.44, 18.83, 16.35],
  ['Cheap LLMs can read traces efficiently,', 22.01, 24.26, 22.09, ch.cost + .45],
  ['but fail to find crucial issues.', 24.64, 26.51, 24.72, ch.cost + 2.95],
  ['Powerful LLMs can find deep issues,', 26.8, 29.09, 26.88, ch.cost + 6.2],
  ['but the costs are unsustainable,', 29.43, 31.06, 29.51, ch.cost + 10.02],
  ['until now.', 31.32, 32.06, 31.4, ch.cost + 13.3],
  ['Introducing Flow 1, our model specialized for trace analysis,', 32.77, 36.56, 32.85, flowNative + .45],
  ['matching Sonnet 5 intelligence', 36.96, 38.84, 37.04, flowNative + 4.6],
  ['at only 2% of the cost.', 38.84, 40.5, 38.88, flowNative + 6.85],
  ['Flow 1 powers Signals,', 41.34, 42.8, 41.42, flowNative + 10.25],
  ['our agent built to analyze traces', 42.82, 44.505, 42.89, prelude + .3],
  ['at scale.', 44.505, 45.37, 44.505, prelude + 2.65],
  ['It finds deep issues in every trace', 45.9, 48.08, 45.98, prelude + 4.65],
  ['and clusters them into high-level patterns,', 48.13, 50.32, 48.21, postlude + .2],
  ['ready for you or your coding agent.', 50.7, 52.66, 50.78, postlude + 2.75],
  ['Unlock the insights hiding in millions of agent traces', 53.23, 56.09, 53.31, ch.conclusion + .1],
  ['with Laminar.', 56.18, 56.97, 56.26, ch.conclusion + 3.1],
];
const placed = phrases.map(([text, a, b, onset, out]) => ({text, a, b, at: r3(out - (onset - a))}));
placed.forEach((p, i) => {
  const next = placed[i + 1];
  if (next && p.at + p.b - p.a > next.at + .2) console.warn(`OVERLAP: ${p.text}`);
});
writeFileSync('handoff/voiceover-retime/retimed-settings.json', JSON.stringify(settings, null, 1));
writeFileSync('handoff/voiceover-retime/placements.json', JSON.stringify(placed, null, 1));
console.log(chapterSchedule(settings).map(c => `${c.id} ${c.start.toFixed(2)}-${c.end.toFixed(2)}`).join('\n'));
placed.forEach(p => console.log(p.at.toFixed(2), '→', (p.at + p.b - p.a).toFixed(2), p.text));
