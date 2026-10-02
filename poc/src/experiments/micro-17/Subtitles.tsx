import type {Progress} from './sample';

const subtitles = [
  ['subtitleBuild', 'You build agents.'],
  ['subtitleTrace', 'Every time your agent runs, it leaves a trace.'],
  ['subtitleFailure', 'When your agent fails,'],
  ['subtitleWhy', 'the trace can tell you why.'],
  ['subtitleInsights', 'The insights you need to make your agents efficient, fast, and reliable are hidden across thousands of traces.'],
  ['subtitleIfOnly', 'If only someone could read them all.'],
] as const satisfies readonly (readonly [keyof Progress, string])[];

const opacity = (progress: number) => progress <= 0 || progress >= 1
  ? 0 : Math.min(1, progress / .12, (1 - progress) / .12);

export const Subtitles = ({progress}: {progress: Progress}) => <div className="micro17-subtitle-layer" aria-live="off">
  {subtitles.map(([key, text]) => <div key={key} className="micro17-subtitle" style={{opacity: opacity(progress[key])}}>{text}</div>)}
</div>;
