import Link from "next/link";

import LandingButton from "../landing-button";

const CTA = () => (
  <section className="flex w-full items-center justify-center gap-5 py-[60px]">
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
  </section>
);

export default CTA;
