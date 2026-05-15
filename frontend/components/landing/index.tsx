"use client";

import { cn } from "@/lib/utils";

import Footer from "./footer";
import Hero from "./hero";
import BuiltForProduction from "./sections/built-for-production";
import ClaudeFixMyAgent from "./sections/claude-fix-my-agent";
import CTA from "./sections/cta";
import DidMyFixWork from "./sections/did-my-fix-work";
import Divider from "./sections/divider";
import HasThisIssue from "./sections/has-this-issue";
import Quote from "./sections/quote";
import TwoLinesToIntegrate from "./sections/two-lines-to-integrate";
import UnderstandWhy from "./sections/understand-why";

interface Props {
  className?: string;
  hasSession: boolean;
}

// Page structure: <Hero /> on top, then <UnderstandWhy /> as a full-viewport
// scrolly-tell that doesn't share the 880px column (so the bento can grow
// past 880 and remain horizontally centered at stage 6), then the remaining
// sections in the standard 880px column below.
const Landing = ({ className, hasSession }: Props) => (
  <div className={cn("bg-landing-surface-800 overflow-x-clip flex flex-col", className)}>
    <Hero hasSession={hasSession} />
    <UnderstandWhy />
    <div className="flex flex-col items-center w-full px-6 md:px-0 pt-[100px] pb-[72px] md:pb-[120px]">
      <div className="flex flex-col items-start gap-[120px] w-full max-w-[880px]">
        <HasThisIssue />
        <ClaudeFixMyAgent />
        <DidMyFixWork />
        <Divider />
        <TwoLinesToIntegrate />
        <Divider />
        <Quote />
        <Divider />
        <BuiltForProduction />
        <CTA />
      </div>
    </div>
    <Footer />
  </div>
);

export default Landing;
