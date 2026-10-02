import {useEffect, useRef, useState} from 'react';

export type AutomaticAudioEngine = {
  enable: () => Promise<void>;
  pause: () => void;
};

type UnlockTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/**
 * Tries Web Audio eagerly, then retries resume directly inside ordinary trusted
 * pointer/keyboard gestures. Unlocking never starts audio while playback is paused.
 */
export function installAutomaticAudioUnlock(
  target: UnlockTarget,
  isPlaybackWanted: () => boolean,
  resume: () => Promise<void>,
  onReady: () => void,
) {
  let disposed = false;
  const attempt = (fromGesture = false) => {
    if (disposed || (!fromGesture && !isPlaybackWanted())) return;
    // Deliberately do not dedupe pending promises: a resume attempted outside a
    // user gesture must not prevent a synchronous retry inside the next gesture.
    let result: Promise<void>;
    try { result = resume(); } catch { return; }
    void result.then(() => {
      if (!disposed && isPlaybackWanted()) onReady();
    }, () => { /* Autoplay denial is expected; the next gesture retries it. */ });
  };
  // A Play control owned by another component updates React state after its
  // event handlers run, so gestures unlock even if playback was paused at the
  // start of the event. onReady still gates all sound on actual playback.
  const onPointer = () => attempt(true);
  const onKey = () => attempt(true);
  target.addEventListener('pointerdown', onPointer, {capture: true});
  target.addEventListener('keydown', onKey, {capture: true});
  attempt();
  return () => {
    disposed = true;
    target.removeEventListener('pointerdown', onPointer, {capture: true});
    target.removeEventListener('keydown', onKey, {capture: true});
  };
}

export function useAutomaticAudio(engine: AutomaticAudioEngine, playbackWanted: boolean) {
  const wanted = useRef(playbackWanted);
  wanted.current = playbackWanted;
  const [readyAttempt, setReadyAttempt] = useState(0);

  useEffect(() => {
    if (!playbackWanted) engine.pause();
    return installAutomaticAudioUnlock(window, () => wanted.current, () => engine.enable(), () => setReadyAttempt(value => value + 1));
  }, [engine, playbackWanted]);

  return readyAttempt;
}
