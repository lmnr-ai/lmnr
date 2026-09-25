import type {Micro15SubtitleProgress} from './sample';

export const MICRO_15_SUBTITLES = [
  ['subtitleIssues', 'It finds issues'],
  ['subtitlePatterns', 'and clusters them into high-level patterns'],
  ['subtitleReady', 'Ready for you or your coding agents.'],
] as const satisfies readonly (readonly [keyof Micro15SubtitleProgress, string])[];

// Each independently editable timeline bar is the complete visible lifetime.
const opacity = (progress: number) => progress <= 0 || progress >= 1
  ? 0 : Math.min(1, progress / .12, (1 - progress) / .12);

export const Subtitles = ({progress}: {progress: Micro15SubtitleProgress}) => <div className="micro15-subtitle-layer" aria-live="off">
  {MICRO_15_SUBTITLES.map(([key, text]) => <div key={key} className="micro15-subtitle" data-subtitle={key}
    style={{opacity: opacity(progress[key])}}>{text}</div>)}
</div>;
