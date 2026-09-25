import {Audio, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Ultimate3Scene} from '../experiments/micro-18/Scene';
import {sampleUltimate3, ultimate3DurationFrames} from '../experiments/micro-18/sample';
import {ULTIMATE_3_DEFAULTS, normalizeSettings, type Ultimate3Settings} from '../experiments/micro-18/settings';

export type MicroAnimation18Props = {settings: Ultimate3Settings; audioSrc?: string};
export const MICRO_18_VIDEO_DEFAULTS: MicroAnimation18Props = {settings: ULTIMATE_3_DEFAULTS};
export const micro18DurationFrames = (props: MicroAnimation18Props) => ultimate3DurationFrames(normalizeSettings(props.settings));
export const MicroAnimation18 = ({settings = ULTIMATE_3_DEFAULTS, audioSrc}: MicroAnimation18Props) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig(); const normalized = normalizeSettings(settings);
  return <><Ultimate3Scene sample={sampleUltimate3(frame / fps, normalized)} settings={normalized}/>{audioSrc ? <Audio src={/^(?:https?:|data:|blob:)/.test(audioSrc) ? audioSrc : staticFile(audioSrc)}/> : null}</>;
};
