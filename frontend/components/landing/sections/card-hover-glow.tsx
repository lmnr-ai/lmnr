import Image from "next/image";

// The swoosh sliding into a card's bottom-right on hover. Its card MUST be
// `group relative overflow-hidden`, and every tunable is a `--card-glow-*`
// property. The shape occupies only the middle 521x114 of a 721x314 file (the
// blur needs bleed), hence the negative offset defaults.
const GLOW_W = 721;
const GLOW_H = 314;

const CardHoverGlow = () => (
  <span
    aria-hidden
    className="pointer-events-none absolute max-w-none w-[721px] bottom-[var(--card-glow-y,-228px)] right-[var(--card-glow-x,-140px)] translate-x-[var(--card-glow-slide,180px)] opacity-0 transition-[opacity,transform] ease-out duration-[var(--card-glow-ms,1600ms)] group-hover:translate-x-0 group-hover:opacity-[var(--card-glow-opacity,0.1)]"
  >
    <Image src="/assets/landing/card-hover-glow.svg" alt="" width={GLOW_W} height={GLOW_H} className="block w-full" />
  </span>
);

export default CardHoverGlow;
