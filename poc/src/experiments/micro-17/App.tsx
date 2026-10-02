import {useEffect, useRef} from 'react';
import {DialRoot, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {agentScreenPan, DEFAULTS, worldState} from './geometry';
import {livePlayback, sampleMicro17} from './sample';
import {Micro17Scene} from './Scene';
import {MICRO_17_TIMELINE, MICRO_17_TIMELINE_ID, normalizeTiming, timingWarnings} from './timeline';
import {micro17CloudInWindow} from './stream-run-sound';
import {useStreamRunAudio} from './use-stream-run-audio';

export const Micro17App = () => {
  const editor = useRef<HTMLElement>(null);
  useEffect(() => {
    let dock: Element | null = null;
    const update = () => {
      const rect = dock?.getBoundingClientRect();
      const reserved = rect && rect.height > 0 ? window.innerHeight - rect.top + 6 : 0;
      editor.current?.style.setProperty('--micro17-timeline-height', `${reserved}px`);
    };
    const resize = new ResizeObserver(update);
    const attach = () => {
      const next = document.querySelector('.dialkit-timeline');
      if (next === dock) return;
      resize.disconnect(); dock = next;
      if (dock) resize.observe(dock);
      update();
    };
    const mount = new MutationObserver(attach);
    mount.observe(document.body, {childList: true, subtree: true}); attach();
    window.addEventListener('resize', update);
    return () => {mount.disconnect(); resize.disconnect(); window.removeEventListener('resize', update);};
  }, []);

  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Ultimate 2 — Master (seconds)', MICRO_17_TIMELINE, {
    id: MICRO_17_TIMELINE_ID, autoplay: true, loop: false, persist: true,
  });
  const controls = useDialKit('Motion', {
    streamerSpeed: [DEFAULTS.streamerSpeed, 240, 1200, 10],
    loaderSpeed: [DEFAULTS.loaderSpeed, 0, 6, .05],
    cloudEntrySpread: [DEFAULTS.cloudEntrySpread, 0, 1600, 10],
    introCameraOffsetCells: [DEFAULTS.introCameraOffsetCells, -2, 2, .05],
  }, {id: 'micro-animation-17-motion-v2', persist: true});
  const openingClouds = useDialKit('Opening clouds', {
    backXOffset: [DEFAULTS.openingCloudBackXOffset, -1000, 1000, 1],
    frontXOffset: [DEFAULTS.openingCloudFrontXOffset, -1000, 1000, 1],
  }, {id: 'micro-animation-17-opening-clouds-v4', persist: true});
  const warning = useDialKit('Warning marker', {
    xOffset: [DEFAULTS.warningXOffset, -200, 500, 1],
    yOffset: [DEFAULTS.warningYOffset, -200, 300, 1],
  }, {id: 'micro-animation-17-warning-v2', persist: true});
  const soundMix = useDialKit('Animation sound', {
    tickVolume: [1, 0, 10, .01],
    puffVolume: [1, 0, 1.5, .01],
    cloudVolume: [1, 0, 1.5, .01],
  }, {id: 'micro-animation-17-stream-run-sound-v1', persist: true});
  const query = new URLSearchParams(window.location.search);
  const requested = Number(query.get('time'));
  const inspecting = query.has('time') && Number.isFinite(requested);
  const playback = inspecting ? sampleMicro17(Math.max(0, requested)) : livePlayback(timeline);
  const appearance = inspecting ? DEFAULTS : {...controls, openingCloudBackXOffset: openingClouds.backXOffset, openingCloudFrontXOffset: openingClouds.frontXOffset, warningXOffset: warning.xOffset, warningYOffset: warning.yOffset};
  useStreamRunAudio(playback.time, !inspecting && timeline.playing, {at: timeline.streamRun.at, duration: timeline.streamRun.duration},
    {...soundMix, streamPanAt: t => agentScreenPan(worldState(sampleMicro17(t, timeline), appearance))}, {cloudIn: micro17CloudInWindow(normalizeTiming(timeline))});
  const warnings = timingWarnings(normalizeTiming(timeline));
  return <main ref={editor} className="micro17-app" data-time={playback.time}>
    <div className="micro17-stage"><Micro17Scene playback={playback} controls={appearance}/></div>
    {!inspecting && warnings.length > 0 && <div className="micro17-warning">{warnings.join(' ')}</div>}
    <ExperimentPicker current="micro-17"/><DialRoot/><DialTimeline/>
  </main>;
};
