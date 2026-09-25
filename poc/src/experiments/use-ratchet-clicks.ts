import {useEffect, useRef} from 'react';
import {useAutomaticAudio} from './automatic-audio';
import {clickEventsBetween, RatchetClickEngine, type ClickTrack} from './ratchet-click';

export function useRatchetClicks(time: number, playing: boolean, tracks: readonly ClickTrack[], volume = 1) {
  const engine = useRef<RatchetClickEngine | null>(null); const previous = useRef(time);
  engine.current ??= new RatchetClickEngine();
  const ready = useAutomaticAudio(engine.current, playing);
  useEffect(() => () => engine.current?.dispose(), []);
  useEffect(() => engine.current?.setVolume(volume), [volume]);
  useEffect(() => {
    const before = previous.current; previous.current = time;
    if (!playing || ready === 0 || time < before || time - before > .25) { engine.current?.pause(); return; }
    for (const event of clickEventsBetween(before, time, tracks)) engine.current?.play(event);
  }, [playing, ready, time, tracks]);
}
