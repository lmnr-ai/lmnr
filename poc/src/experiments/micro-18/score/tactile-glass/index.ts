import type {ScoreStyle} from '../style';
import {composeScore} from './composition';
import {designSound, planDucks} from './design';

export const tactileGlass: ScoreStyle = {
  id: 'tactile-glass',
  title: 'Tactile Glass',
  ducks: planDucks,
  compose: composeScore,
  design: designSound,
};
