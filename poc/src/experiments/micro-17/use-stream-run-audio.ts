import {useEffect, useRef} from 'react';
import {useAutomaticAudio} from '../automatic-audio';
import {Micro10AudioEngine} from '../micro-10/sound';
import {ultimate2ClickTracks} from '../ratchet-click';
import {useRatchetClicks} from '../use-ratchet-clicks';
import {STREAM_RUN_FADE_DURATION, agentWindowSoundEventsBetween, cameraMoveEventsBetween, cloudWhooshEventsBetween, directionalWhooshEventsBetween, dotTwinkleEventsBetween, drawerOpeningEventsBetween, flowDoorSoundEventsBetween, flowRatchetEventsBetween, flowRevealEventsBetween, numberDropEventsBetween, openingCloudPuffEventsBetween, streamRunAudioEventsBetween, streamRunAudioStateAt, type AgentWindowSoundTiming, type CameraMoveWindow, type CloudWhooshWindows, type DirectionalWhooshWindow, type DotTwinkleCue, type DrawerOpeningEffect, type FlowDoorSoundTiming, type StreamRunWindow} from './stream-run-sound';

export type StreamRunAudioMix = {masterGain?: number; tickVolume: number; puffVolume: number; puffOffset?: number; cloudVolume: number; streamPanAt?: (time: number) => number; streamEnd?: number; drawerVolume?: number; cameraVolume?: number; cameraSound?: 'procedural' | 'deepCamera'; cameraDurationMultiplier?: number; flowRevealVolume?: number; flowRevealTimeToPeak?: number; flowRevealTail?: number; flowRatchetVolume?: number; twinkleVolume?: number; numberDropVolume?: number; numberDropBase?: number | string; agentWindowSlideVolume?: number; agentWindowClickVolume?: number};

export function useStreamRunAudio(time: number, playing: boolean, streamRun: StreamRunWindow, mix: StreamRunAudioMix, cloudWhooshes: CloudWhooshWindows = {}, drawerOpenings: readonly number[] = [], drawerEffect: DrawerOpeningEffect = 'bubblePair', cameraMoves: readonly CameraMoveWindow[] = [], flowReveal?: StreamRunWindow, flowRatchet?: StreamRunWindow, flowRatchetInterval = .02, twinkleCues: readonly DotTwinkleCue[] = [], twinkleBaseMidi = 84, openingCloudPuffs: readonly number[] = [], agentWindowSounds?: AgentWindowSoundTiming, numberDropTimes: readonly number[] = [], flowDoorSounds?: FlowDoorSoundTiming, directionalWhooshes: readonly DirectionalWhooshWindow[] = []) {
  const clickTracks = ultimate2ClickTracks(streamRun, mix.streamPanAt, mix.streamEnd, STREAM_RUN_FADE_DURATION);
  useRatchetClicks(time, playing, clickTracks, mix.tickVolume * (mix.masterGain ?? 1));
  const audio = useRef<Micro10AudioEngine | null>(null);
  const previousTime = useRef(time);
  if (!(audio.current instanceof Micro10AudioEngine)) {
    (audio.current as {dispose?: () => void} | null)?.dispose?.();
    audio.current = new Micro10AudioEngine();
  }

  const readyAttempt = useAutomaticAudio(audio.current, playing);
  useEffect(() => () => audio.current?.dispose(), []);
  useEffect(() => audio.current?.setMasterGain(mix.masterGain ?? 1), [mix.masterGain]);
  useEffect(() => audio.current?.setMix({tickVolume: mix.tickVolume, puffVolume: mix.puffVolume, whooshVolume: mix.cloudVolume, drawerVolume: mix.drawerVolume ?? 1, cameraVolume: mix.cameraVolume ?? 1, cameraSound: mix.cameraSound ?? 'deepCamera', cameraDurationMultiplier: mix.cameraDurationMultiplier ?? 1, flowRevealVolume: mix.flowRevealVolume ?? 1, flowRevealTimeToPeak: mix.flowRevealTimeToPeak, flowRevealTail: mix.flowRevealTail, flowRatchetVolume: mix.flowRatchetVolume ?? 1, twinkleVolume: mix.twinkleVolume ?? 1, numberDropVolume: mix.numberDropVolume ?? 1, numberDropBaseMidi: Number(mix.numberDropBase ?? 79), agentWindowSlideVolume: mix.agentWindowSlideVolume ?? 1, agentWindowClickVolume: mix.agentWindowClickVolume ?? 1, droneVolume: 0}), [mix.agentWindowClickVolume, mix.agentWindowSlideVolume, mix.cameraDurationMultiplier, mix.cameraSound, mix.cameraVolume, mix.cloudVolume, mix.drawerVolume, mix.flowRatchetVolume, mix.flowRevealTail, mix.flowRevealTimeToPeak, mix.flowRevealVolume, mix.puffVolume, mix.tickVolume, mix.twinkleVolume, mix.numberDropVolume, mix.numberDropBase]);
  useEffect(() => {
    const previous = previousTime.current;
    previousTime.current = time;
    if (!playing || readyAttempt === 0) {
      audio.current?.pause();
      return;
    }
    if (time < previous || time - previous > .25) {
      audio.current?.pause();
      return;
    }
    const streamState = streamRunAudioStateAt(time, streamRun);
    if (streamState.phase === 'silent') audio.current?.silenceStream();
    else audio.current?.setStreamGain(streamState.gain);
    // Ultimate 2's legacy tick is replaced, while its independently scheduled puffs and fade tail remain.
    for (const event of streamRunAudioEventsBetween(previous, time, streamRun, undefined, mix.puffOffset)) if (event.kind !== 'tick') audio.current?.play(event.kind);
    for (const event of cloudWhooshEventsBetween(previous, time, cloudWhooshes)) audio.current?.play(event.kind, event.duration);
    for (const event of openingCloudPuffEventsBetween(previous, time, openingCloudPuffs)) audio.current?.play(event.kind, event.duration);
    for (const event of agentWindowSoundEventsBetween(previous, time, agentWindowSounds)) audio.current?.play(event.kind);
    for (const event of flowDoorSoundEventsBetween(previous, time, flowDoorSounds)) audio.current?.play(event.kind);
    for (const event of drawerOpeningEventsBetween(previous, time, drawerOpenings, drawerEffect)) audio.current?.play(event.kind);
    for (const event of cameraMoveEventsBetween(previous, time, cameraMoves)) audio.current?.play(event.kind, event.duration);
    for (const event of directionalWhooshEventsBetween(previous, time, directionalWhooshes)) audio.current?.play(event.kind, event.duration);
    for (const event of flowRevealEventsBetween(previous, time, flowReveal)) audio.current?.play(event.kind, event.duration);
    for (const event of flowRatchetEventsBetween(previous, time, flowRatchet, flowRatchetInterval)) audio.current?.play(event.kind);
    for (const event of numberDropEventsBetween(previous, time, numberDropTimes)) audio.current?.play(event.kind);
    for (const event of dotTwinkleEventsBetween(previous, time, twinkleCues)) {
      audio.current?.playDotTwinkle(event.noteIndex, event.pan, twinkleBaseMidi, event.gain);
    }
  }, [agentWindowSounds?.down.at, agentWindowSounds?.thockAt, agentWindowSounds?.up.at, cameraMoves, directionalWhooshes, cloudWhooshes.cloudIn?.at, cloudWhooshes.cloudIn?.duration, cloudWhooshes.cloudOut?.at, cloudWhooshes.cloudOut?.duration, drawerEffect, drawerOpenings, flowRatchet?.at, flowRatchet?.duration, flowRatchetInterval, flowDoorSounds?.slide.at, flowDoorSounds?.thockAt, flowReveal?.at, flowReveal?.duration, mix.puffOffset, numberDropTimes, openingCloudPuffs, playing, readyAttempt, streamRun.at, streamRun.duration, time, twinkleBaseMidi, twinkleCues]);
}
