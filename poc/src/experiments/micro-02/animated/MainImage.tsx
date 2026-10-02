import type {CSSProperties} from 'react';
import {staticFile} from 'remotion';
import {clamp01, easeOutCubic} from '../animation';

const LANDSCAPE = staticFile('micro-02/96e915ab1ae203ae3e9786022ca338638d8ebc51.png');

export const MainImage = ({
  maskProgress,
  orangeProgress,
  whiteProgress,
}: {
  maskProgress: number;
  orangeProgress: number;
  whiteProgress: number;
}) => {
  const reveal = easeOutCubic(clamp01(maskProgress));
  const growRight = {
    transform: `scaleX(${easeOutCubic(clamp01(orangeProgress))})`,
    transformOrigin: 'left center',
  };
  const growLeft = {
    transform: `scaleX(${easeOutCubic(clamp01(whiteProgress))})`,
    transformOrigin: 'right center',
  };

  return (
    <div
      className="micro02-band"
      style={{clipPath: `inset(${(1 - reveal) * 50}% 0 ${(1 - reveal) * 50}% 0)`}}
    >
      <img className="micro02-landscape" src={LANDSCAPE} alt="" />
      <div className="micro02-shadow" />
      <div className="micro02-orange micro02-orange-main" style={growRight} />
      <div className="micro02-orange micro02-orange-thin" style={growRight} />
      <div className="micro02-white micro02-white-top" style={growLeft} />
      <div className="micro02-white micro02-white-bottom" style={growLeft} />
    </div>
  );
};
