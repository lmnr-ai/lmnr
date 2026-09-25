import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {INTRODUCING_FLOW_1_TIMELINE} from '../introducing-flow-1/timeline';
import {Ultimate3Scene} from './Scene';
import {chapterSchedule, sampleUltimate3} from './sample';
import {normalizeSettings, ULTIMATE_3_DEFAULTS} from './settings';

const nativeCoverStart = INTRODUCING_FLOW_1_TIMELINE.coverDescent.at;
const nativeCoverDuration = INTRODUCING_FLOW_1_TIMELINE.coverDescent.duration;
const flowStart = chapterSchedule(ULTIMATE_3_DEFAULTS)[2].start;
const integratedTime = (nativeTime: number) => flowStart + ULTIMATE_3_DEFAULTS.flow.entrySlide.duration + nativeTime;
const renderCover = (nativeTime: number) => renderToStaticMarkup(createElement(Ultimate3Scene, {
  sample: sampleUltimate3(integratedTime(nativeTime), ULTIMATE_3_DEFAULTS),
  settings: ULTIMATE_3_DEFAULTS,
}));
const doorLefts = (markup: string) => [...markup.matchAll(/class="flow1-cover-door flow1-cover-door-(?:left|right)" style="left:([^;]+)/g)]
  .map(match => Number(match[1].replace('px', '')));

test('integrated Flow native cover closure renders two opposing source doors', () => {
  const early = renderCover(nativeCoverStart);
  const middle = renderCover(nativeCoverStart + nativeCoverDuration / 2);
  const end = renderCover(nativeCoverStart + nativeCoverDuration);

  for (const markup of [early, middle, end]) {
    assert.equal((markup.match(/flow1-cover-door flow1-cover-door-/g) ?? []).length, 2);
    assert.ok(!markup.includes('class="flow1-cover"'), 'single sliding panel must not render');
  }
  const [earlyLeft, earlyRight] = doorLefts(early);
  const [middleLeft, middleRight] = doorLefts(middle);
  const [endLeft, endRight] = doorLefts(end);
  assert.ok(earlyLeft < middleLeft && middleLeft < endLeft, 'left door must close rightward');
  assert.ok(earlyRight > middleRight && middleRight > endRight, 'right door must close leftward');

  const topSettings = normalizeSettings({...ULTIMATE_3_DEFAULTS, flow: {...ULTIMATE_3_DEFAULTS.flow,
    controls: {...ULTIMATE_3_DEFAULTS.flow.controls, coverMotion: 'top'}}});
  const topMarkup = renderToStaticMarkup(createElement(Ultimate3Scene, {
    sample: sampleUltimate3(integratedTime(nativeCoverStart + nativeCoverDuration / 2), topSettings),
    settings: topSettings,
  }));
  const camera = (markup: string) => markup.match(/data-camera-x="[^"]+" data-camera-y="[^"]+" data-camera-scale="[^"]+"/)?.[0];
  assert.equal(camera(middle), camera(topMarkup), 'cover selection must not alter the shared camera');
  const signalSubtitle = 'Flow-1 powers Signals, our agent build to analyze traces at scale.';
  assert.ok(middle.includes(signalSubtitle));
  assert.ok(topMarkup.includes(signalSubtitle), 'cover selection must not alter native subtitle timing');
});
