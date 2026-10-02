import {DialRoot, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {DEFAULTS, worldState} from './geometry';
import {livePlayback, sampleMicro12} from './sample';
import {Micro12Scene} from './Scene';
import {MICRO_12_TIMELINE, MICRO_12_TIMELINE_ID} from './timeline';

export const Micro12App = () => {
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Ultimate — Master (seconds)', MICRO_12_TIMELINE, {
    id: MICRO_12_TIMELINE_ID, autoplay: true, loop: true, persist: true,
  });
  const controls = useDialKit('Motion', {
    streamerSpeed: [DEFAULTS.streamerSpeed, 240, 1200, 10],
    loaderSpeed: [DEFAULTS.loaderSpeed, 0, 6, .05],
    streamSeed: [DEFAULTS.streamSeed, 0, 9999, 1],
    maxZoom: [DEFAULTS.maxZoom, 1, 48, .25],
    cloudEntrySpread: [DEFAULTS.cloudEntrySpread, 0, 1600, 10],
    introCameraOffsetCells: [DEFAULTS.introCameraOffsetCells, -2, 2, .05],
  }, {id: 'micro-animation-12-motion-v2', persist: true});
  const openingClouds = useDialKit('Opening clouds', {
    backXOffset: [DEFAULTS.openingCloudBackXOffset, -1000, 1000, 1],
    frontXOffset: [DEFAULTS.openingCloudFrontXOffset, -1000, 1000, 1],
  }, {id: 'micro-animation-12-opening-clouds-v4', persist: true});
  const smoke = useDialKit('Smoke', {
    footballMinOpacity: [DEFAULTS.footballSmokeMinOpacity, 0, 1, .01],
  }, {id: 'micro-animation-12-smoke-v2', persist: true});
  const warning = useDialKit('Warning marker', {
    xOffset: [DEFAULTS.warningXOffset, -200, 500, 1],
    yOffset: [DEFAULTS.warningYOffset, -200, 300, 1],
  }, {id: 'micro-animation-12-warning-v2', persist: true});
  const query = new URLSearchParams(window.location.search);
  const requested = Number(query.get('time'));
  const inspecting = query.has('time') && Number.isFinite(requested);
  const playback = inspecting ? sampleMicro12(Math.max(0, requested)) : livePlayback(timeline);
  const appearance = inspecting ? DEFAULTS : {...controls, openingCloudBackXOffset: openingClouds.backXOffset, openingCloudFrontXOffset: openingClouds.frontXOffset, footballSmokeMinOpacity: smoke.footballMinOpacity, warningXOffset: warning.xOffset, warningYOffset: warning.yOffset};
  const {shortRun} = worldState(playback, appearance);
  const orderInvalid = timeline.cameraBacktrack.at < timeline.streamRun.at + timeline.streamRun.duration - .001
    || timeline.finale.at < timeline.cloudEnter.at + timeline.cloudEnter.duration - .001
    || Math.abs(timeline.cameraCenterAgent.at - timeline.streamRun.at) > .001;
  return <main className="micro12-app">
    <div className="micro12-stage"><Micro12Scene playback={playback} controls={appearance}/></div>
    {!inspecting && (shortRun || orderInvalid) && <div className="micro12-warning">{shortRun ? 'Stream run is too short to reveal all three lifting blocks.' : 'Keep camera centering aligned with streamRun, backtrack after streamRun, and finale after cloudEnter.'}</div>}
    <ExperimentPicker current="micro-12"/><DialRoot/><DialTimeline/>
  </main>;
};
