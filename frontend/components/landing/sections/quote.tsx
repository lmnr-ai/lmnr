import Image from "next/image";

import browserUseFullLogo from "@/assets/landing/logos/browser-use-full.svg";

// Customer quote at the bottom of the landing page. Matches Figma node
// 4054:8911 — left-aligned, attribution row spans the quote width.
const Quote = () => (
  <section className="flex flex-col items-start gap-8 px-6 w-full max-w-[560px]">
    <p className="font-manrope font-medium text-white text-2xl leading-8 tracking-[-0.02em] whitespace-pre-line">
      {`“We run millions of agent sessions in our cloud,\nand when something goes wrong,\nLaminar’s trace view is the first place we look”`}
    </p>
    <div className="flex items-center justify-between w-full">
      <div className="font-sans text-landing-text-300 text-lg leading-6">
        <p>Magnus Müller</p>
        <p>CEO</p>
      </div>
      <Image src={browserUseFullLogo} alt="Browser Use" height={28} className="h-7 w-auto" />
    </div>
  </section>
);

export default Quote;
