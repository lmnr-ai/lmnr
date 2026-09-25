import type {FlowProgress} from './sample';

const subtitles = [
  ['subtitleIntroducing', 'Introducing Flow-1, our model specialized for trace analysis.'],
  ['subtitleIntelligence', 'Matching Sonnet-5 in intelligence.'],
  ['subtitleCost', 'At 2% of the cost.'],
  ['subtitleSignals', 'Flow-1 powers Signals, our agent build to analyze traces at scale.'],
] as const satisfies readonly (readonly [keyof FlowProgress, string])[];

const opacity = (progress: number) => progress <= 0 || progress >= 1
  ? 0 : Math.min(1, progress / .12, (1 - progress) / .12);

export const Subtitles = ({progress}: {progress: FlowProgress}) => <div className="flow1-subtitle-layer" aria-live="off">
  {subtitles.map(([key, text]) => <div key={key} className="flow1-subtitle" style={{opacity: opacity(progress[key])}}>{text}</div>)}
</div>;
