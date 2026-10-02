import {useCurrentFrame, useVideoConfig} from 'remotion';
import {
  computeClipState,
  computeStaticTimeline,
  parseTimelineConfig,
  type TimelineConfig,
} from 'dialkit/timeline';
import {Micro02Scene, type Micro02ComponentValues} from '../experiments/micro-02/Scene';
import {
  DOTS_TIMELINE,
  GRIDS_TIMELINE,
  MAIN_IMAGE_TIMELINE,
  PARAGRAPH_TIMELINE,
  PORTRAIT_TIMELINE,
  RAILS_TIMELINE,
  STATS_TIMELINE,
} from '../experiments/micro-02/componentTimelines';
import {MICRO_02_TIMELINE} from '../experiments/micro-02/timeline';

const sampler = (config: TimelineConfig) => {
  const {clips} = computeStaticTimeline(parseTimelineConfig(config), {});
  return (time: number) => Object.fromEntries(
    clips.map((clip) => [
      clip.key,
      (computeClipState(clip, time, time) as {current?: Record<string, number>}).current ?? {},
    ]),
  ) as Record<string, Record<string, number>>;
};

const sampleMaster = sampler(MICRO_02_TIMELINE);
const sampleMainImage = sampler(MAIN_IMAGE_TIMELINE);
const samplePortrait = sampler(PORTRAIT_TIMELINE);
const sampleStats = sampler(STATS_TIMELINE);
const sampleRails = sampler(RAILS_TIMELINE);
const sampleGrids = sampler(GRIDS_TIMELINE);
const sampleDots = sampler(DOTS_TIMELINE);
const sampleParagraph = sampler(PARAGRAPH_TIMELINE);

export const MicroAnimation02 = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const time = frame / fps;
  const master = sampleMaster(time);
  const local = (key: string) => (master[key]?.progress ?? 0) * 100;

  const mainImage = sampleMainImage(local('mainImage'));
  const portrait = samplePortrait(local('portrait'));
  const stats = sampleStats(local('stats'));
  const rails = sampleRails(local('rails'));
  const grids = sampleGrids(local('grids'));
  const dots = sampleDots(local('dots'));
  const paragraph = sampleParagraph(local('paragraph'));

  const portraitStartFrame = Math.round(2.53 * fps);
  const portraitFrame = frame - portraitStartFrame;
  const flashFrame = Math.floor(1.4 * 0.25 * fps);
  const oneFrameFlash = portraitFrame === flashFrame ? 1 : 0;

  const values: Micro02ComponentValues = {
    mainImage: {
      mask: mainImage.mask.progress,
      orangeBars: mainImage.orangeBars.progress,
      whiteBars: mainImage.whiteBars.progress,
    },
    portrait: {
      container: portrait.container.progress,
      imageReveal: Math.max(oneFrameFlash, portrait.finalImage.progress),
    },
    stats: {
      background: stats.background.progress,
      content: stats.content.progress,
      count: stats.count.progress,
    },
    rails: {
      top: rails.topRail.progress,
      bottom: rails.bottomRail.progress,
    },
    grids: {
      topLeft: grids.topLeft.progress,
      bottomRight: grids.bottomRight.progress,
    },
    dots: dots.reveal.progress,
    paragraph: paragraph.words.progress,
  };

  return <Micro02Scene values={values} />;
};
