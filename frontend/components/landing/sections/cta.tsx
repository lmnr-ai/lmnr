import CTAButtons from "../cta-buttons";

// Final CTA — the same close-out the blog posts get (see
// components/blog/post-content/post-layout), heading and all, so both surfaces
// end on one composition rather than the landing page ending on a bare pair of
// buttons.
const CTA = () => (
  <section className="w-full py-[60px] flex flex-col gap-8">
    <h2 className="font-sans-landing text-[32px] font-[480] text-white whitespace-pre-line leading-tight">
      {"Ship reliable agents"}
    </h2>
    <CTAButtons />
  </section>
);

export default CTA;
