import type {Flow3Playback} from './sample';

const captions = [
  ['subtitleIntroducing', 'Introducing flow-1, our model specialized for trace analysis.'],
  ['subtitleIntelligence', 'Specialized for intelligent trace analysis.'],
  ['subtitleCost', 'Analyzing 20x more traces per dollar.'],
  ['subtitleSignals', 'flow-1 powers Signals, our agent built to analyze traces at scale.'],
] as const;

export const Subtitles = ({progress}: Pick<Flow3Playback, 'progress'>) => <div className="flow1-subtitle-layer" aria-live="off">
  {captions.map(([key, text]) => {
    const p = progress[key];
    const opacity = p <= 0 || p >= 1 ? 0 : Math.min(1, p / .12, (1 - p) / .12);
    return <div key={key} className="flow1-subtitle" style={{opacity}}>{text}</div>;
  })}
</div>;
