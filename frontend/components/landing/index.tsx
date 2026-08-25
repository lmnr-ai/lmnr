"use client";

import { cn } from "@/lib/utils";

import { LANDING_COLUMN_MAX_W } from "./class-names";
import Footer from "./footer";
import Hero from "./hero";
import AskInSlack from "./sections/ask-in-slack";
import BuiltForProduction from "./sections/built-for-production";
import ClaudeFixMyAgent from "./sections/claude-fix-my-agent";
import Compliance from "./sections/compliance";
import CTA from "./sections/cta";
import DidMyFixWork from "./sections/did-my-fix-work";
import Divider from "./sections/divider";
import FeaturesForEveryStep from "./sections/features-for-every-step";
import HasThisIssue from "./sections/has-this-issue";
import OpenSource from "./sections/open-source";
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
  <div className={cn("bg-surface-150 overflow-x-clip flex flex-col", className)}>
    <Hero hasSession={hasSession} />
    {/* 160px controls the gap to the logo strip above. The subtraction just
        cancels the sticky child's own centring — its frame is 760 inside an
        h-screen box — so the number means the real gap and nothing else. */}
    <UnderstandWhy className="md:mt-[calc(160px-(100vh-760px)/2)]" />
    <div className="flex flex-col items-center w-full px-6 lg:px-0 pt-[100px] pb-[72px] md:pb-[120px]">
      <div className={cn("flex flex-col items-start gap-[120px] w-full", LANDING_COLUMN_MAX_W)}>
        {/* Mobile only. On desktop this is the closing step of the scrollytell
            above, where the signal card collapses into a pill and drops into
            the clusters card — a gesture that needs scroll to scrub against,
            which touch does not have. The two share their copy through
            `STEPS[5]` in understand-why-trace-view/steps. */}
        <div className="md:hidden w-full">
          <HasThisIssue />
        </div>
        <AskInSlack />
        <ClaudeFixMyAgent />
        <DidMyFixWork />
        <Divider />
        <TwoLinesToIntegrate />
        <FeaturesForEveryStep />
        <Divider />
        <Quote />
        <Divider />
        <BuiltForProduction />
        <Divider />
        <OpenSource />
        <Compliance />
        <CTA />
      </div>
    </div>
    <Footer />
  </div>
);

export default Landing;
