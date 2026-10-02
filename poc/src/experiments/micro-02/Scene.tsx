import {Dots} from './animated/Dots';
import {Grids} from './animated/Grids';
import {MainImage} from './animated/MainImage';
import {Paragraph} from './animated/Paragraph';
import {Portrait} from './animated/Portrait';
import {Rails} from './animated/Rails';
import {Stats} from './animated/Stats';

export interface Micro02ComponentValues {
  mainImage: {mask: number; orangeBars: number; whiteBars: number};
  portrait: {container: number; imageReveal: number};
  stats: {background: number; content: number; count: number};
  rails: {top: number; bottom: number};
  grids: {topLeft: number; bottomRight: number};
  dots: number;
  paragraph: number;
}

const COMPLETE: Micro02ComponentValues = {
  mainImage: {mask: 1, orangeBars: 1, whiteBars: 1},
  portrait: {container: 1, imageReveal: 1},
  stats: {background: 1, content: 1, count: 1},
  rails: {top: 1, bottom: 1},
  grids: {topLeft: 1, bottomRight: 1},
  dots: 1,
  paragraph: 1,
};

export const Micro02Scene = ({values = COMPLETE}: {values?: Micro02ComponentValues}) => (
  <div className="micro02-scene">
    <MainImage
      maskProgress={values.mainImage.mask}
      orangeProgress={values.mainImage.orangeBars}
      whiteProgress={values.mainImage.whiteBars}
    />
    <Rails topProgress={values.rails.top} bottomProgress={values.rails.bottom} />
    <Grids
      topLeftProgress={values.grids.topLeft}
      bottomRightProgress={values.grids.bottomRight}
    />
    <Paragraph progress={values.paragraph} />
    <Portrait
      containerOpacity={values.portrait.container}
      imageReveal={values.portrait.imageReveal}
    />
    <Dots progress={values.dots} />
    <Stats
      backgroundProgress={values.stats.background}
      contentProgress={values.stats.content}
      countProgress={values.stats.count}
    />
  </div>
);
