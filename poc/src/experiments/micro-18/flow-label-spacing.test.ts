import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Flow2Graph} from '../introducing-flow-1-2/Scene';
import {graphState} from '../introducing-flow-1-2/geometry';
import {GRAPH_MODELS} from '../introducing-flow-1-2/metrics';
import {CURRENT_VOICEOVER_DEFAULTS as settings} from './current-cut';
import {chapterSchedule, flowNarrationRevealAt, sampleFlow} from './sample';
import {voiceoverCaptionAt, voiceoverCaptionWindows} from './VoiceoverCaptions';

const playback = sampleFlow(35.5 - chapterSchedule(settings)[2].start, settings).playback21!;
const flowRevealAt = flowNarrationRevealAt(settings);

test('flow/Sol and Gemini/Luna have the same readable vertical gap', () => {
  const graph = graphState(playback, settings.flow.controls.beadStaggerSeconds, flowRevealAt);
  const y = (id: string) => graph.points.find(point => point.id === id)!.y;
  const gap = y('luna') - y('gemini');
  assert.ok(Math.abs(y('sol') - graph.ball.y - gap) < 1e-8);
  assert.ok(Math.abs(gap - 36) < 1e-8);
  assert.ok(gap > 32, '32px-high labels must not overlap');
  assert.equal(GRAPH_MODELS.find(model => model.id === 'flow')!.descF1, 74.1);
  assert.equal(graph.points.find(point => point.id === 'opus')!.descF1, 84.8);
  assert.equal(graph.points.find(point => point.id === 'opus')!.y, 32, '84.8 label must not clip above the frame');
  assert.equal(graph.points.find(point => point.id === 'sonnet')!.descF1, 77.3);
  assert.equal(graph.points.find(point => point.id === 'sol')!.descF1, 72.8);
  const html = renderToStaticMarkup(createElement(Flow2Graph, {playback, flowRevealAt,
    comparison: {assemblyExit: 0, headingExit: 0}}));
  assert.match(html, /class="flow2-flow-score"[^>]*>74\.1%<\/span>/);
});

test('the subtitle says Matching without moving its existing phrase window', () => {
  const text = 'Matching GPT-6-Sol in intelligence, while analyzing 20 times more traces per dollar.';
  assert.equal(voiceoverCaptionAt(35.5, settings.voiceover!), text);
  const window = voiceoverCaptionWindows(settings.voiceover!).find(caption => caption.text === text)!;
  assert.equal(window.start, settings.voiceover!.phrases.n12.at);
  assert.equal(window.end, settings.voiceover!.phrases.n13.at + settings.voiceover!.phrases.n13.duration + .4);
});
