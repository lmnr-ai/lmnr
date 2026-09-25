import type {CSSProperties} from 'react';
import {staticFile} from 'remotion';

export interface StatsProps {
  backgroundProgress: number;
  contentProgress: number;
  countProgress: number;
}

const asset = (name: string) => staticFile(`micro-02/${name}`);

const stats = [
  {
    icon: asset('b4dce4bf6e2914975ae8673bd0d15281d3414b73.svg'),
    finalValue: 59.2,
    format: (value: number) => `${value.toFixed(1)}s`,
  },
  {
    icon: asset('0601d37e3a07acebe71f2e4e5dbb7ebc3aff33cb.svg'),
    finalValue: 2.1,
    format: (value: number) => `${value.toFixed(1)}M`,
  },
  {
    icon: asset('b084a60248da4ac008302cb308d87bf87f8c6930.svg'),
    finalValue: 5.45,
    format: (value: number) => value.toFixed(2),
  },
] as const;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const Stats = ({backgroundProgress, contentProgress, countProgress}: StatsProps) => {
  const background = clamp01(backgroundProgress);
  const contentOpacity = clamp01(contentProgress);
  const count = clamp01(countProgress);

  return (
    <div className="micro02-stats" style={{background: 'transparent'}}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: '#2d2d2f',
          transform: `scaleX(${background})`,
          transformOrigin: 'left center',
        }}
      />
      {stats.map(({icon, finalValue, format}) => (
        <div
          className="micro02-stat"
          key={icon}
          style={{position: 'relative', opacity: contentOpacity} as CSSProperties}
        >
          <img src={icon} alt="" />
          <span>{format(finalValue * count)}</span>
        </div>
      ))}
    </div>
  );
};
