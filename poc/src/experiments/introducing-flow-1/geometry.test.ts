import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BENCHMARKS, benchmarkPercentLabel, BENCHMARK_WORLD_X, BENCHMARK_WORLD_Y, ENGINE_WORLD_X, ENGINE_WORLD_Y, coverGeometry, DOT, GRID, introducingFlowState, LINE_PITCH, LINE_STRIP, staggeredRevealProgress, positiveMod, SCREEN_LINE_PITCH, SETTLED_CAMERA_SCALE, settledWorldLength} from './geometry';
import {IntroducingFlow1Scene} from './Scene';
import {liveIntroducingFlow1, sampleIntroducingFlow1, type FlowProgress} from './sample';
import {FLOW_CLIP_KEYS, FLOW_ENDPOINT_SCHEDULE, INTRODUCING_FLOW_1_DURATION, INTRODUCING_FLOW_1_TIMELINE as clips} from './timeline';

const near = (actual: number, expected: number, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
const stateAt = (time: number) => introducingFlowState(sampleIntroducingFlow1(time));
const withProgress = (progress: Partial<FlowProgress>) => {
  const initial = sampleIntroducingFlow1(0);
  return introducingFlowState({...initial, progress: {...initial.progress, ...progress}});
};
const [, percentages, analysis, engine, , closed] = FLOW_ENDPOINT_SCHEDULE.map(item => item.time);
assert.equal(INTRODUCING_FLOW_1_DURATION, 13.3);
assert.equal(FLOW_CLIP_KEYS.length, 25);
const expectedTiming: Record<string,[number,number]> = {
  cloudReveal:[.45,.9],cloudExit:[2.2,1.51],cameraZoom:[2.11,1],cameraToBenchmark:[2.13,1.2],dotsExit:[1.95,.9],
  benchmarkHeading:[3.28,.23],modelRows:[3.49,.25],percentageReveal:[3.39,.2],percentageCountUp:[3.59,.4],
  cameraToAnalysis:[6.1,.51],numberSwap:[6.11,.3],analysisCountUp:[6.42,1.01],barsGrow:[6.42,.56],analysisHeading:[6.35,.45],
  cameraToEngine:[8.64,.66],moduleActivation:[9.2,.19],engineSpinner:[9.35,.8],engineLines:[9.35,.8],
  coverDescent:[9.77,.49],coverTint:[10.11,.45],coverSpinner:[10.16,.41],
  subtitleIntroducing:[.45,2.83],subtitleIntelligence:[3.28,2.82],subtitleCost:[6.1,2.54],subtitleSignals:[8.64,4.66],
};
for (const key of FLOW_CLIP_KEYS) {
  assert.deepEqual([clips[key].at,clips[key].duration],expectedTiming[key],`${key} tuned default`);
  assert.equal(clips[key].transition.duration,expectedTiming[key][1]);
}
near(stateAt(0).camera.scale, 1); near(stateAt(0).camera.x, -110); near(stateAt(0).camera.y, 10);
near(stateAt(percentages).camera.scale, .6); near(stateAt(percentages).camera.x, 220); near(stateAt(percentages).camera.y, -720);
near(stateAt(analysis).camera.y, -960); near(stateAt(engine).camera.y, -2040);
// Zoom starts from the viewport center, then applies exactly half a settled cell
// of phase correction so endpoint edge cells are 40px/40px, not 10px slivers.
const openingCenterWorld = {x: (640 - GRID.frame1Translation.x), y: (360 - GRID.frame1Translation.y)};
for (const progress of [.25,.5,.75,1]) {
  const {camera} = withProgress({cameraZoom: progress});
  near(openingCenterWorld.x * camera.scale + camera.x, 640 + 30 * progress);
  near(openingCenterWorld.y * camera.scale + camera.y, 360);
}
// Independent Figma endpoints, after adding twelve world cells of title-to-table travel.
near(BENCHMARK_WORLD_X * stateAt(percentages).camera.scale + stateAt(percentages).camera.x, 100);
near(BENCHMARK_WORLD_Y * stateAt(percentages).camera.scale + stateAt(percentages).camera.y, 300);
near(BENCHMARK_WORLD_Y * stateAt(analysis).camera.scale + stateAt(analysis).camera.y, 60);
near(ENGINE_WORLD_X * stateAt(engine).camera.scale + stateAt(engine).camera.x, 400);
near(ENGINE_WORLD_Y * stateAt(engine).camera.scale + stateAt(engine).camera.y, 120);
assert.ok((211+238)*stateAt(percentages).camera.scale+stateAt(percentages).camera.y<0, 'title leaves naturally through camera travel');
for (const time of [percentages, analysis, engine, closed]) {
  const {camera} = stateAt(time);
  near(positiveMod(camera.x,60),40); near(positiveMod(camera.y,60),0);
}
// 1280 = 20×60 + 40 + 40: the chosen phase has balanced substantial edge cells.
near(positiveMod(stateAt(percentages).camera.x, 60), 40);
near(1280 - (40 + 20 * 60), 40);
// Both content unions are exactly 600px tall, centered with 60px margins.
near(BENCHMARK_WORLD_Y * stateAt(percentages).camera.scale + stateAt(percentages).camera.y - 240, 60);
near(720 - (BENCHMARK_WORLD_Y * stateAt(percentages).camera.scale + stateAt(percentages).camera.y + 360), 60);
near(BENCHMARK_WORLD_Y * stateAt(analysis).camera.scale + stateAt(analysis).camera.y, 60);
near(720 - (BENCHMARK_WORLD_Y * stateAt(analysis).camera.scale + stateAt(analysis).camera.y + 600), 60);
// Every surface track can be retimed without implicitly revealing/counting/filling a component.
for (const key of ['cameraZoom','cameraToBenchmark','cameraToAnalysis','cameraToEngine'] as const) {
  const state = withProgress({[key]: .5});
  for (const field of ['benchmarkHeading','modelRows','percentageReveal','percentageCountUp','numberSwap','analysisCountUp','barsGrow','analysisHeading','activation','cover'] as const) near(state[field],0);
  near(state.cloudProgress,0);near(state.cloudTranslateY,0);
}
for (const key of ['benchmarkHeading','modelRows','percentageReveal','percentageCountUp','numberSwap','analysisCountUp','barsGrow','analysisHeading','moduleActivation','coverDescent','coverTint'] as const) {
  assert.deepEqual(withProgress({[key]: .5}).camera,stateAt(0).camera, `${key} must not move the camera`);
}
assert.deepEqual(BENCHMARKS.map(row => row.barScreen), [10,27,638,10,307,40]);
assert.deepEqual(BENCHMARKS.map(row => row.count), [6,9,238,6,116,11]);
const rowRevealStart = clips.modelRows.at;
assert.equal(staggeredRevealProgress(rowRevealStart + .049, clips.modelRows, 1, .05), 0,
  'the second opening card waits for the 50ms stagger');
assert.ok(staggeredRevealProgress(rowRevealStart + .051, clips.modelRows, 1, .05) > 0);
assert.equal(staggeredRevealProgress(rowRevealStart + .149, clips.modelRows, 3, .05), 0,
  'each following opening card receives another full stagger interval');
assert.ok(staggeredRevealProgress(rowRevealStart + .151, clips.modelRows, 3, .05) > 0);
assert.equal(staggeredRevealProgress(rowRevealStart + .1, clips.modelRows, 5, 0),
  staggeredRevealProgress(rowRevealStart + .1, clips.modelRows, 0, 0), 'zero stagger keeps every opening card synchronized');
// Figma records ceil-rounded text boxes, not fractional browser glyph widths.
assert.deepEqual(BENCHMARKS.map(row => 1+row.barScreen+20+row.nameWidthScreen+12), [144,195,772,228,542,342]);
for (const row of BENCHMARKS) near(settledWorldLength(row.barScreen)*SETTLED_CAMERA_SCALE,row.barScreen);
near(DOT.cellLeft+DOT.size/2,50.5);near(DOT.cellTop+DOT.size/2,49.5);
near(stateAt(percentages).dotScale,0);
assert.equal(benchmarkPercentLabel('opus',89,.4),'89.0%');
assert.equal(benchmarkPercentLabel('flow',81.9,.4),'32.8%');
assert.equal(benchmarkPercentLabel('flow',81.9,1),'81.9%');
assert.ok(clips.percentageCountUp.at>=clips.percentageReveal.at+clips.percentageReveal.duration-1e-9);
assert.ok(clips.analysisCountUp.at>=clips.numberSwap.at+clips.numberSwap.duration);
for (const fraction of [.1,.5,.9]) {
  const percent = stateAt(clips.percentageCountUp.at+clips.percentageCountUp.duration*fraction);
  near(percent.percentageReveal,1);near(percent.numberSwap,0);near(percent.percentageCountUp,fraction,1e-4);
  const counts = stateAt(clips.analysisCountUp.at+clips.analysisCountUp.duration*fraction);
  near(counts.numberSwap,1);near(counts.analysisCountUp,fraction,1e-4);
}
for (const value of [-10000,-LINE_PITCH,-.01,0,LINE_PITCH,10000]) {
  const mod = positiveMod(value,LINE_PITCH);assert.ok(mod>=0&&mod<LINE_PITCH);
}
near(LINE_PITCH*SETTLED_CAMERA_SCALE,SCREEN_LINE_PITCH);
const asset = readFileSync(new URL('../../../public/introducing-flow-1/assets/99a27f841624c57b67238f0d5a92d01f446e8255.svg',import.meta.url),'utf8');
assert.match(asset,/M26\.0586 143\.799L168\.442 1\.41422/);
assert.equal((asset.match(/<path /g)??[]).length,9);
for (const elapsed of [0,LINE_PITCH/48-1e-5,LINE_PITCH/48+1e-5,10000]) {
  const offset=positiveMod(elapsed*48,LINE_PITCH);
  const tops=Array.from({length:LINE_STRIP.tileCount},(_,i)=>LINE_STRIP.top+(i-1)*LINE_STRIP.pathsPerTile*LINE_PITCH-offset);
  near((tops[1]-tops[0])*SETTLED_CAMERA_SCALE,SCREEN_LINE_PITCH*9);
  assert.ok(tops[1]<0&&tops[1]+LINE_STRIP.height>398.333);
}
const wrapAt=clips.engineLines.at+LINE_PITCH/48;
near(stateAt(wrapAt-1e-6).lineOffset,LINE_PITCH-48e-6,1e-5);
near(stateAt(wrapAt+1e-6).lineOffset,48e-6,1e-5);
const sampled=sampleIntroducingFlow1(10.8);
const liveInput={time:sampled.time,...Object.fromEntries(FLOW_CLIP_KEYS.map(key=>[key,{
  ...sampled.timing[key],current:{progress:sampled.progress[key]},
}]))} as Parameters<typeof liveIntroducingFlow1>[0];
assert.deepEqual(liveIntroducingFlow1(liveInput),sampled);
const retimed=introducingFlowState(liveIntroducingFlow1({...liveInput,time:12,
  engineSpinner:{at:11.5,duration:1,current:{progress:.5}},
  engineLines:{at:11.75,duration:1,current:{progress:.25}},
  coverSpinner:{at:11,duration:1,current:{progress:1}},
}));
near(retimed.spinnerAngle,60);near(retimed.lineOffset,12);near(retimed.coverAngle,0);
const coverSpinStart=clips.coverSpinner.at, coverSpinPeriod=clips.coverSpinner.duration;
near(stateAt(coverSpinStart-.01).coverAngle,0);
near(stateAt(coverSpinStart+coverSpinPeriod/4).coverAngle,90);
near(stateAt(coverSpinStart+coverSpinPeriod/2).coverAngle,180);
near(stateAt(coverSpinStart+coverSpinPeriod).coverAngle,0);
assert.notEqual(stateAt(closed).spinnerAngle,stateAt(closed+.5).spinnerAngle);
const topOpen = coverGeometry(0, 'top');
const topClosed = coverGeometry(1, 'top');
near(topOpen.ringX, 0); near(topOpen.coverY, -753.333); near(topClosed.coverX, 0); near(topClosed.coverY, 0); near(topClosed.size, 800);
for (const progress of [0,.25,.5,.75,1]) {
  const right = coverGeometry(progress, 'right');
  const leftCenter = right.ringX + 400;
  const rightCenter = right.coverX + right.size / 2;
  near((leftCenter + rightCenter) / 2, 400);
  near(leftCenter, 400 - 387.5 * (1-progress));
  near(rightCenter, 400 + 387.5 * (1-progress));
}
near(coverGeometry(1,'right').ringX,0);near(coverGeometry(1,'right').coverX,0);
for (const progress of [0,.25,.5,.75,1]) {
  const split = coverGeometry(progress, 'split');
  const leftInnerEdge = split.leftDoorX! + split.size / 2;
  const rightInnerEdge = split.rightDoorX!;
  near((leftInnerEdge + rightInnerEdge) / 2, 400);
  assert.ok(leftInnerEdge <= 400 && rightInnerEdge >= 400);
}
near(coverGeometry(1,'split').leftDoorX!,0);near(coverGeometry(1,'split').rightDoorX!,400);
const markup=renderToStaticMarkup(createElement(IntroducingFlow1Scene,{playback:sampleIntroducingFlow1(percentages)}));
const tunedMarkup=renderToStaticMarkup(createElement(IntroducingFlow1Scene,{playback:sampleIntroducingFlow1(1.5),cloudYOffset:88,blueDotScale:3.25,mutedGray:'#445566'}));
const splitMarkup=renderToStaticMarkup(createElement(IntroducingFlow1Scene,{playback:sampleIntroducingFlow1(coverSpinStart+coverSpinPeriod/4),coverMotion:'split'}));
const staggeredMarkup=renderToStaticMarkup(createElement(IntroducingFlow1Scene,{playback:sampleIntroducingFlow1(rowRevealStart+.16),numberRowStagger:.05}));
const initialPlayback=sampleIntroducingFlow1(0);
const descentOnlyMarkup=renderToStaticMarkup(createElement(IntroducingFlow1Scene,{playback:{...initialPlayback,progress:{...initialPlayback.progress,coverDescent:1,coverTint:0}}}));
assert.match(markup,/Trace analysis <br\/>intelligence/);
assert.match(markup,/<div class="flow1-title">Flow-1<\/div>/);
for (const text of ['Introducing Flow-1, our model specialized for trace analysis.', 'Matching Sonnet-5 in intelligence.',
  'At 2% of the cost.', 'Flow-1 powers Signals, our agent build to analyze traces at scale.']) assert.ok(markup.includes(text));
assert.doesNotMatch(markup,/flow1-cloud-backing/);
assert.equal((markup.match(/flow1-cover-loader/g)??[]).length,2);
assert.match(tunedMarkup,/scale\(3\.25\)/, 'blue-dot size dial reaches rendered dots');
assert.match(tunedMarkup,/--flow1-muted-gray:#445566/, 'muted-gray color dial reaches the scene CSS variable');
assert.ok(new Set([...staggeredMarkup.matchAll(/flow1-number flow1-number-old" style="transform:translateY\(([^)]+)\)/g)].map(match=>match[1])).size > 3,
  'row stagger reaches each rendered opening number independently');
assert.ok(new Set([...staggeredMarkup.matchAll(/flow1-slide" style="transform:translateY\(([^)]+)\)/g)].map(match=>match[1])).size > 3,
  'row stagger reaches each rendered opening card independently');

assert.equal((splitMarkup.match(/flow1-cover-door/g)??[]).length,4, 'split mode renders two named half masks');
assert.equal((splitMarkup.match(/rotate\(145\.7\d*deg\)/g)??[]).length,4, 'split spinner keeps its downward base orientation while rotating');
assert.equal((descentOnlyMarkup.match(/opacity:1;transform:rotate\(0deg\)/g)??[]).length,1, 'descent alone cannot change spinner color');
assert.equal((descentOnlyMarkup.match(/opacity:0;transform:rotate\(0deg\)/g)??[]).length,1, 'coverTint exclusively controls spinner color crossfade');
console.log('Animation 13 camera/component independence, visible count timing, Figma endpoints, loops and live retiming passed.');
