import Image from "next/image";

// The faint swoosh that slides into a card's bottom-right corner on hover.
// Shared by the Enterprise-ready and "every stage of agent development" grids.
//
// The card it sits in MUST be `group relative overflow-hidden` — `group` drives
// the transition, `relative` anchors it, and `overflow-hidden` is what keeps it
// from painting outside the card while it travels.
//
// The artwork is a 4%-opacity fill under a 50px gaussian blur, so it reads as a
// warm smudge rather than a shape. That 4% lives INSIDE the SVG; the opacity
// animated here is the element's own, on top of it.
//
// The file is 721x314 but the shape only occupies the middle 521x114 — the blur
// needs 100px of bleed on every side. Hence the -100px offsets, which put the
// SHAPE's bottom-right on the card's bottom-right rather than the file's.
const GLOW_W = 721;
const GLOW_H = 314;
const BLUR_BLEED = 100;

const CardHoverGlow = () => (
  <span
    aria-hidden
    style={{ bottom: -BLUR_BLEED, right: -BLUR_BLEED, width: GLOW_W }}
    className="pointer-events-none absolute max-w-none translate-x-[100px] opacity-0 transition-[opacity,transform] duration-500 ease-out group-hover:translate-x-0 group-hover:opacity-100"
  >
    <Image src="/assets/landing/card-hover-glow.svg" alt="" width={GLOW_W} height={GLOW_H} className="block w-full" />
  </span>
);

export default CardHoverGlow;
