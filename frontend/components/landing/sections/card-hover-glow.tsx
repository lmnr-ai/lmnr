import Image from "next/image";

// The faint swoosh that slides into a card's bottom-right corner on hover.
// Shared by the Enterprise-ready and "every stage of agent development" grids.
//
// The card it sits in MUST be `group relative overflow-hidden` — `group` drives
// the transition, `relative` anchors it, and `overflow-hidden` is what keeps it
// from painting outside the card while it travels.
//
// Every tunable is a CSS custom property with its default inline in the class,
// so ./card-glow-dials can retune the whole page by setting five properties on
// :root and production, where nothing sets them, runs on the fallbacks. Do not
// move the defaults into a `style` prop — inline styles outrank :root, and the
// dials would stop working.
//
// The file is 721x314 but the shape only occupies the middle 521x114 — the blur
// needs 100px of bleed on every side. Hence the negative offset defaults, which
// put the SHAPE's bottom-right on the card's bottom-right rather than the
// file's.
const GLOW_W = 721;
const GLOW_H = 314;

/** Committed defaults, mirrored in the class below as the var fallbacks — the
 *  dials module reads them so its knobs start where production sits. */
export const CARD_GLOW_DEFAULTS = {
  slide: 180,
  durationMs: 1600,
  /** The artwork is a solid fill, so this alone is what makes it faint. */
  opacity: 0.2,
  offsetX: -140,
  offsetY: -228,
};

const CardHoverGlow = () => (
  <span
    aria-hidden
    className="pointer-events-none absolute max-w-none w-[721px] bottom-[var(--card-glow-y,-228px)] right-[var(--card-glow-x,-140px)] translate-x-[var(--card-glow-slide,180px)] opacity-0 transition-[opacity,transform] ease-out duration-[var(--card-glow-ms,1600ms)] group-hover:translate-x-0 group-hover:opacity-[var(--card-glow-opacity,0.2)]"
  >
    <Image src="/assets/landing/card-hover-glow.svg" alt="" width={GLOW_W} height={GLOW_H} className="block w-full" />
  </span>
);

export default CardHoverGlow;
