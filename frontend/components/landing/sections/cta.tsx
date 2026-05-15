import Link from "next/link";

import LandingButton from "../landing-button";

// Final CTA — left-aligned within the 880px column.
const CTA = () => (
  <section className="flex items-start w-full py-[60px]">
    <div className="flex items-center gap-5">
      <Link href="/sign-up">
        <LandingButton variant="primary" size="sm" className="w-[160px]">
          Get Started
        </LandingButton>
      </Link>
      <Link href="https://cal.com/robert-lmnr/30min" target="_blank">
        <LandingButton variant="outline" size="sm" className="w-[160px]">
          Book a demo
        </LandingButton>
      </Link>
    </div>
  </section>
);

export default CTA;
