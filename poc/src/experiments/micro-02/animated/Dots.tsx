import {intervalProgress} from '../animation';

export interface DotsProps {
  progress: number;
}

const DOT_COUNT = 36;
const DOT_REVEAL_OVERLAP = 0.45;
const revealDuration = 1 / (DOT_COUNT - (DOT_COUNT - 1) * DOT_REVEAL_OVERLAP);
const revealStride = revealDuration * (1 - DOT_REVEAL_OVERLAP);

export const Dots = ({progress}: DotsProps) => (
  <div className="micro02-dots">
    {Array.from({length: DOT_COUNT}, (_, index) => {
      const dotProgress = intervalProgress(
        progress,
        index * revealStride,
        index * revealStride + revealDuration,
      );

      return (
        <i
          key={index}
          style={{
            opacity: dotProgress,
            transform: `scale(${dotProgress})`,
            transformOrigin: 'center',
          }}
        />
      );
    })}
  </div>
);
