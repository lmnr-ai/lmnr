import {useCurrentFrame, useVideoConfig} from 'remotion';
import {Micro08Scene} from '../experiments/micro-08/Scene';
import {sampleMicro08} from '../experiments/micro-08/sample';
import {BLOCK_CONTENT_DEFAULTS} from '../experiments/micro-08/block-content';

export const MicroAnimation08 = ({showWordsAndIcons = BLOCK_CONTENT_DEFAULTS.showWordsAndIcons}: {showWordsAndIcons?: boolean}) => {
  const {fps} = useVideoConfig();
  return <Micro08Scene {...sampleMicro08(useCurrentFrame() / fps)} showWordsAndIcons={showWordsAndIcons}/>;
};
