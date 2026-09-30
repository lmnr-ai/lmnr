import {getRemotionEnvironment, Img, staticFile} from 'remotion';
import type {CSSProperties} from 'react';

/** Figma 4740:28387 → image 233 (4859:7955). Keep this screen-pinned,
 * not inside any chapter camera. The rotated bounds are (-20,-32,1320,891).
 * The exported image already carries Figma's image treatment; no extra filters. */
export const PAPER_TEXTURE_STYLE: CSSProperties = {
  position: 'absolute',
  left: 1300,
  top: -32,
  width: 891,
  height: 1320,
  maxWidth: 'none',
  transform: 'rotate(90deg)',
  transformOrigin: '0 0',
  objectFit: 'cover',
  objectPosition: '50% 50%',
  mixBlendMode: 'multiply',
  opacity: 1,
  pointerEvents: 'none',
  zIndex: 100,
};

export const PaperTexture = () => {
  // Img waits for decoding in a render, but requires a Remotion composition.
  // DialKit's plain React preview must use the same asset as a native image.
  const Image = getRemotionEnvironment().isRendering ? Img : 'img';
  return <Image
  data-paper-texture="true"
  data-figma-node="4859:7955"
  src={staticFile('micro-18/paper-texture.png')}
  alt=""
  aria-hidden="true"
  draggable={false}
  style={PAPER_TEXTURE_STYLE}
/>;
};
