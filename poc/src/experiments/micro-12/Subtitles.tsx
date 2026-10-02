import type {Progress} from './sample';

const subtitles = [
  ['subtitleBuild', 'You build agents'],
  ['subtitleWantKnow', 'and you want to know what they’re up to'],
  ['subtitleCollectRun', 'Everytime your agent runs we collect a trace.'],
  ['subtitleTraceDoing', 'It tells you exactly what your agent is doing.'],
  ['subtitleCollectEvery', 'Your agents run a lot.'],
  ['subtitleBetter', 'The insights you need to make your agents better faster and more reliable...'],
  ['subtitleHidden', 'Are hidden in your traces.'],
  ['subtitleIfOnly', 'If only someone could read them all.'],
  ['subtitleSignals', 'That’s why we built Laminar Signals.'],
] as const satisfies readonly (readonly [keyof Progress, string])[];

// A clip's bar is its complete visible lifetime. The first/last 12% provide
// a small fade while preserving one independently draggable bar per subtitle.
const opacity = (progress: number) => progress <= 0 || progress >= 1
  ? 0 : Math.min(1, progress / .12, (1 - progress) / .12);

export const Subtitles = ({progress}: {progress: Progress}) => <div className="micro12-subtitle-layer" aria-live="off">
  {subtitles.map(([key, text]) => <div key={key} className="micro12-subtitle" style={{opacity: opacity(progress[key])}}>{text}</div>)}
</div>;
