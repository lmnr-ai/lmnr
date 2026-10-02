import {useFlow1FontReady} from '../introducing-flow-1/Scene';
import type {VoiceoverSettings} from './settings';

/** Authored on-screen wording; each line retains its existing speech-clip window. */
export const VOICEOVER_CAPTIONS = [
  {text: "This is the agent you've built", phrases: ['n01']},
  {text: 'Every time it runs, it leaves a trace.', phrases: ['n02']},
  {text: 'When your agent fails, the trace can tell you why.', phrases: ['n03', 'n04']},
  {text: 'The insights you need to make your agents efficient, fast, and reliable are hidden across thousands of traces', phrases: ['n05']},
  {text: 'If only someone could read them all.', phrases: ['n06']},
  {text: 'Cheap LLMs fail to find crucial issues.', phrases: ['n07']},
  {text: 'Powerful LLMs find deep issues,', phrases: ['n08']},
  {text: 'but the costs are unsustainable.', phrases: ['n09']},
  {text: 'Until now.', phrases: ['n10']},
  {text: 'Introducing Flow-1, our model specialized for trace analysis.', phrases: ['n11']},
  {text: 'Matching GPT-6-Sol in intelligence, while analyzing 20 times more traces per dollar.', phrases: ['n12', 'n13']},
  {text: 'Flow-1 powers Signals, our agent built to analyze traces at scale.', phrases: ['n14', 'n15']},
  {text: 'It finds deep issues, and reports them.', phrases: ['n16']},
  {text: 'Not just with labels,', phrases: ['n17']},
  {text: 'but with any structure you define,', phrases: ['n18']},
  {text: 'across every trace.', phrases: ['n19']},
  {text: 'It clusters issues into high level patterns', phrases: ['n20']},
  {text: 'Ready for you or your coding agent.', phrases: ['n21']},
  {text: 'Unlock the insights hiding in millions of agent traces.', phrases: ['n22']},
  {text: 'With Laminar.', phrases: ['n23']},
] as const;
// Readers finish a line just after the voice does; the next line always cuts it.
const HOLD = .4;

export function voiceoverCaptionWindows(voiceover: VoiceoverSettings) {
  const spans = VOICEOVER_CAPTIONS.map(caption => {
    const clips = caption.phrases.map(id => voiceover.phrases[id]).filter(clip => clip && clip.duration > 0);
    return clips.length ? {text: caption.text, start: Math.min(...clips.map(c => c.at)), end: Math.max(...clips.map(c => c.at + c.duration))} : null;
  }).filter(span => span !== null).sort((a, b) => a.start - b.start);
  return spans.map((span, index) => ({...span, end: Math.min(span.end + HOLD, spans[index + 1]?.start ?? Infinity)}));
}

export const voiceoverCaptionAt = (time: number, voiceover: VoiceoverSettings) =>
  voiceoverCaptionWindows(voiceover).find(span => time >= span.start && time < span.end)?.text ?? null;

/** Screen-pinned over every chapter, so narration edits move their captions with them. */
export const VoiceoverCaptions = ({time, voiceover}: {time: number; voiceover: VoiceoverSettings}) => {
  useFlow1FontReady();
  const text = voiceoverCaptionAt(time, voiceover);
  return <div className="micro18-conclusion-subtitle-layer" aria-live="off">
    {text && <div className="micro18-conclusion-subtitle" data-voiceover-caption>{text}</div>}
  </div>;
};
