import {staticFile} from 'remotion';
import {clamp01} from '../animation';

const PORTRAIT = staticFile('micro-02/6e82c2b067b155ac1c4e3432ab5d578f4c514a4e.png');

export const Portrait = ({
  containerOpacity,
  imageReveal,
}: {
  containerOpacity: number;
  imageReveal: number;
}) => {
  const container = clamp01(containerOpacity);
  const reveal = clamp01(imageReveal);

  return (
    <div className="micro02-portrait-frame" style={{opacity: container}}>
      <img className="micro02-portrait" src={PORTRAIT} alt="" />
      <div
        className="micro02-portrait-cover"
        aria-hidden="true"
        style={{opacity: 1 - reveal}}
      />
    </div>
  );
};
