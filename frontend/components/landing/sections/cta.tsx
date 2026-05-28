import CTAButtons from "../cta-buttons";

// Final CTA — mirrors the hero button pair (same color, size, font, copy)
// so both ends of the page read identically.
const CTA = () => (
  <section className="w-full py-[60px]">
    <CTAButtons className="justify-center md:justify-start w-full" />
  </section>
);

export default CTA;
