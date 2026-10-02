import {useFlow1FontReady} from '../introducing-flow-1/Scene';

export const CONCLUSION_SUBTITLES = {
  placeholder: 'Unlock the insights hiding in millions of agent traces',
  logo: 'With Laminar',
} as const;

/** Conclusion copy follows the two existing card stages, including the native
 * terminal logo hold, rather than introducing a separate caption timeline. */
export const ConclusionSubtitles = ({stage}: {stage: keyof typeof CONCLUSION_SUBTITLES}) => {
  useFlow1FontReady();
  return <div className="micro18-conclusion-subtitle-layer" aria-live="off">
    <div className="micro18-conclusion-subtitle">{CONCLUSION_SUBTITLES[stage]}</div>
  </div>;
};
