import type {Micro16State} from './sample';

const subtitles = [
  ['subtitleCheap', 'Cheap LLMs can read trace efficiently'],
  ['subtitleMissIssues', 'but fail to find crucial issues.'],
  ['subtitlePowerful', 'More powerful LLMs can find deep obscure issues'],
  ['subtitleCost', 'but the costs are unsustainable.'],
] as const satisfies readonly (readonly [keyof Micro16State['progress'], string])[];

// Each timeline bar is the subtitle's complete visible lifetime. Fade only at
// the edges so all four bars remain independently draggable authoring controls.
const opacity = (progress: number) => progress <= 0 || progress >= 1
  ? 0 : Math.min(1, progress / .12, (1 - progress) / .12);

export const Subtitles = ({progress}: {progress: Micro16State['progress']}) => <div className="micro16-subtitle-layer" aria-live="off">
  {subtitles.map(([key, text]) => <div key={key} className="micro16-subtitle" style={{opacity: opacity(progress[key])}}>{text}</div>)}
</div>;
