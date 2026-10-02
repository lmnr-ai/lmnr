import {NARRATION, type NarrationKey} from './narration';

export const Subtitles = ({narration, opacity}: {narration: NarrationKey | null; opacity: number}) => <div className="micro20-subtitle-layer" aria-live="off">
  {narration && <div className="micro20-subtitle" data-subtitle={narration} style={{opacity}}>{NARRATION[narration]}</div>}
</div>;
