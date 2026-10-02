import {useEffect, useRef} from 'react';
import {useAutomaticAudio} from '../automatic-audio';
import {ArabesqueBedEngine, ARABESQUE_THOCK_TRIM} from './arabesque-playback';
import type {Ultimate3Settings} from './settings';
import type {Ultimate3SoundMix} from './sound-controls';
import {useIssueTypingAudio} from './typing-audio';
export {ARABESQUE_SOUNDTRACK_URL} from './arabesque-playback';

/** Fixed corrected Arabesque bed, plus exactly one keyboard following current source20 settings.
 * Other legacy engines stay off. musicVolume belongs to Sangers, not this mastered bed.
 */
export function useArabesqueAudio(time: number, playing: boolean, inspecting: boolean, settings: Ultimate3Settings, mix: Ultimate3SoundMix) {
  const bed = useRef<ArabesqueBedEngine | null>(null);
  bed.current ??= new ArabesqueBedEngine();
  const active = playing && !inspecting;
  const ready = useAutomaticAudio(bed.current, active);
  useEffect(() => () => bed.current?.dispose(), []);
  useEffect(() => bed.current?.setMasterVolume(mix.masterVolume), [mix.masterVolume]);
  useEffect(() => bed.current?.update(time, active), [active, ready, time]);
  useIssueTypingAudio(time, active, settings, mix.typingVolume * ARABESQUE_THOCK_TRIM, mix.masterVolume);
}
