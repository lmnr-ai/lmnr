import Image from "next/image";

import browserUseFullLogo from "@/assets/landing/logos/browser-use-full.svg";

// Customer quote — quote text on the left, attribution stack on the right.
// On mobile the layout stacks vertically and the quote text wraps naturally
// (no hand-placed line breaks).
const Quote = () => (
  <section className="flex flex-col md:flex-row items-start justify-between gap-10 w-full">
    <p className="font-manrope font-medium text-white text-xl leading-7 tracking-[-0.02em]">
      “We run millions of agent sessions in our cloud,
      <br className="hidden md:inline" /> and when something goes wrong,
      <br className="hidden md:inline" /> Laminar’s trace view is the first place we look”
    </p>
    <div className="flex flex-col items-start gap-0.5 shrink-0">
      <p className="font-sans text-landing-text-300 text-lg leading-6">Magnus Müller, CEO</p>
      <Image src={browserUseFullLogo} alt="Browser Use" height={28} className="h-7 w-auto" />
    </div>
  </section>
);

export default Quote;
