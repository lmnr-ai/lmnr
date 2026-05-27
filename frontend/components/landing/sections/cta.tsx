import Link from "next/link";

// Final CTA — mirrors the hero button pair (same color, size, font, copy)
// so both ends of the page read identically.
const CTA = () => (
  <section className="flex items-start w-full py-[60px]">
    <div className="flex flex-row gap-3 items-center">
      <Link
        href="/sign-up"
        className="flex items-center justify-center w-[160px] h-[36px] rounded-sm bg-landing-primary-200 hover:bg-landing-primary-400 transition-colors no-underline"
      >
        <span className="font-sans-landing font-medium text-sm text-black">Get started – free</span>
      </Link>
      <Link
        href="https://cal.com/robert-lmnr/30min"
        target="_blank"
        className="flex items-center justify-center w-[160px] h-[36px] rounded-sm hover:bg-landing-surface-700 transition-colors no-underline border border-landing-text-500"
      >
        <span className="font-sans-landing font-medium text-sm text-landing-text-200">Book a demo</span>
      </Link>
    </div>
  </section>
);

export default CTA;
