import {useEffect} from 'react';
import {DialRoot, DialTimeline, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {Micro02Scene, type Micro02ComponentValues} from './Scene';
import {
  DOTS_TIMELINE,
  GRIDS_TIMELINE,
  MAIN_IMAGE_TIMELINE,
  PARAGRAPH_TIMELINE,
  PORTRAIT_TIMELINE,
  RAILS_TIMELINE,
  STATS_TIMELINE,
} from './componentTimelines';
import {MICRO_02_TIMELINE, MICRO_02_TIMELINE_ID} from './timeline';

const localOptions = (id: string) => ({id, autoplay: false, persist: true});
const value = (input: number | string) => Number(input);

export const EmptyAnimationApp = () => {
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const master = useDialTimeline('Micro animation 02 — Master (seconds)', MICRO_02_TIMELINE, {
    id: MICRO_02_TIMELINE_ID,
    autoplay: false,
    loop: true,
    persist: true,
  });
  const mainImage = useDialTimeline(
    'Main image — Local (0–100%)',
    MAIN_IMAGE_TIMELINE,
    localOptions('micro-animation-02-main-image-v3'),
  );
  const portrait = useDialTimeline(
    'Portrait — Local (0–100%)',
    PORTRAIT_TIMELINE,
    localOptions('micro-animation-02-portrait-v1'),
  );
  const stats = useDialTimeline(
    'Stats — Local (0–100%)',
    STATS_TIMELINE,
    localOptions('micro-animation-02-stats-v1'),
  );
  const rails = useDialTimeline(
    'Rails — Local (0–100%)',
    RAILS_TIMELINE,
    localOptions('micro-animation-02-rails-v1'),
  );
  const grids = useDialTimeline(
    'Grids — Local (0–100%)',
    GRIDS_TIMELINE,
    localOptions('micro-animation-02-grids-v1'),
  );
  const dots = useDialTimeline(
    'Dots — Local (0–100%)',
    DOTS_TIMELINE,
    localOptions('micro-animation-02-dots-v1'),
  );
  const paragraph = useDialTimeline(
    'Paragraph — Local (0–100%)',
    PARAGRAPH_TIMELINE,
    localOptions('micro-animation-02-paragraph-v1'),
  );

  // The master owns absolute seconds. Every local timeline owns choreography in
  // percentage-like 0–100 units and is deterministically sought from its bar.
  useEffect(() => mainImage.seek(master.mainImage.current.progress * 100), [master.mainImage.current.progress]);
  useEffect(() => portrait.seek(master.portrait.current.progress * 100), [master.portrait.current.progress]);
  useEffect(() => stats.seek(master.stats.current.progress * 100), [master.stats.current.progress]);
  useEffect(() => rails.seek(master.rails.current.progress * 100), [master.rails.current.progress]);
  useEffect(() => grids.seek(master.grids.current.progress * 100), [master.grids.current.progress]);
  useEffect(() => dots.seek(master.dots.current.progress * 100), [master.dots.current.progress]);
  useEffect(() => paragraph.seek(master.paragraph.current.progress * 100), [master.paragraph.current.progress]);

  const portraitStartFrame = Math.round(master.portrait.at * 30);
  const portraitFrame = Math.floor(master.time * 30) - portraitStartFrame;
  const flashFrame = Math.floor(master.portrait.duration * 0.25 * 30);
  const oneFrameFlash = portraitFrame === flashFrame ? 1 : 0;

  const values: Micro02ComponentValues = {
    mainImage: {
      mask: value(mainImage.mask.current.progress),
      orangeBars: value(mainImage.orangeBars.current.progress),
      whiteBars: value(mainImage.whiteBars.current.progress),
    },
    portrait: {
      container: value(portrait.container.current.progress),
      imageReveal: Math.max(oneFrameFlash, value(portrait.finalImage.current.progress)),
    },
    stats: {
      background: value(stats.background.current.progress),
      content: value(stats.content.current.progress),
      count: value(stats.count.current.progress),
    },
    rails: {
      top: value(rails.topRail.current.progress),
      bottom: value(rails.bottomRail.current.progress),
    },
    grids: {
      topLeft: value(grids.topLeft.current.progress),
      bottomRight: value(grids.bottomRight.current.progress),
    },
    dots: value(dots.reveal.current.progress),
    paragraph: value(paragraph.words.current.progress),
  };

  return (
    <main className="empty-animation">
      <div className="micro02-stage"><Micro02Scene values={values} /></div>
      <ExperimentPicker current="micro-02" />
      <DialRoot />
      <DialTimeline defaultOpen={false} />
    </main>
  );
};
