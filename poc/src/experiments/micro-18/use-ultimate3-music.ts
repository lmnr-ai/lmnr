import {useEffect, useMemo, useRef} from 'react';
import {useAutomaticAudio} from '../automatic-audio';
import {chapterSchedule} from './sample';
import type {Ultimate3Settings} from './settings';
import {Ultimate3MusicEngine, ultimate3SangersMusicPlan} from './ultimate3-music';

export function useUltimate3Music(time: number, playing: boolean, settings: Ultimate3Settings, volume: number, masterGain = 1) {
  const engine = useRef<Ultimate3MusicEngine | null>(null);
  const previousTime = useRef(time);
  const running = useRef(false);
  engine.current ??= new Ultimate3MusicEngine();
  const plan = useMemo(() => ultimate3SangersMusicPlan(settings), [settings]);
  const starts = useMemo(() => {
    const schedule = chapterSchedule(settings);
    return Object.fromEntries(schedule.map(chapter => [chapter.id, chapter.start])) as Record<'ultimate2'|'cost'|'flow'|'issues'|'conclusion', number>;
  }, [settings]);
  const readyAttempt = useAutomaticAudio(engine.current, playing);

  useEffect(() => () => engine.current?.pause(), []);
  useEffect(() => engine.current?.setVolume(volume), [volume]);
  useEffect(() => engine.current?.setMasterGain(masterGain), [masterGain]);
  useEffect(() => {
    const previous = previousTime.current;
    previousTime.current = time;
    if (!playing || readyAttempt === 0 || time >= plan.end) {
      engine.current?.pause();
      running.current = false;
      return;
    }
    const discontinuity = time < previous || time - previous > .25;
    if (!running.current || discontinuity) {
      engine.current?.playFrom(time, plan, starts);
      running.current = true;
    }
  }, [plan, playing, readyAttempt, starts, time]);
}
