import {AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';

const FPS = 30;

const clips = [
  ['A', 0, 2.12], ['B', 2.12, 3.10], ['C', 3.10, 6.30],
  ['D', 6.30, 8.00], ['E', 8.00, 11.48],
  ['F', 11.48, 11.87], ['G', 11.87, 12.26], ['H', 12.26, 12.65], ['I', 12.65, 13.04],
  ['J', 13.04, 19.46],
  ['K', 19.46, 20.19], ['L', 20.19, 20.91], ['M', 20.91, 22.36],
  ['N', 22.36, 24.94], ['O', 24.94, 28.66],
  ['P', 28.66, 30.42], ['Q', 30.42, 32.84], ['S', 32.84, 37.20],
  ['R', 37.20, 41.88], ['T', 41.88, 43.50], ['U', 43.50, 46.04],
  ['V', 46.04, 50.84], ['W', 50.84, 52.44], ['X', 52.44, 54.165333],
] as const;

const musicStartFrame = 10;
const musicEndFrame = 1500;

const BackgroundMusic = () => {
  const frame = useCurrentFrame();
  const duration = musicEndFrame - musicStartFrame;
  const volume = interpolate(frame, [0, 15 * FPS, duration - 8 * FPS, duration], [0, 0.5, 0.5, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <Audio src={staticFile('mixkit-classical-6-713.mp3')} volume={volume} />;
};

export const SlidesVideo = () => {
  const frame = useCurrentFrame();
  const time = frame / FPS;
  const clip = clips.find(([, start, end]) => time >= start && time < end) ?? clips[clips.length - 1];

  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      <Img
        src={staticFile(`slides/${clip[0]}.png`)}
        style={{width: '100%', height: '100%', objectFit: 'cover'}}
      />
      <Audio src={staticFile('dandan-audio.wav')} />
      <Sequence from={musicStartFrame} durationInFrames={musicEndFrame - musicStartFrame}>
        <BackgroundMusic />
      </Sequence>
    </AbsoluteFill>
  );
};
