"use client";

import dynamic from "next/dynamic";

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

// Dev-only animation dials. `IS_DEV` is inlined at build time, so the whole
// dynamic() call — and the dialkit chunk behind it — is dead code in a
// production build and never reaches the landing bundle. Mounted HERE, once:
// the dock renders every dial registered anywhere, so one per section would
// draw a duplicate copy of the whole thing. Sections only run the hooks.
const IS_DEV = process.env.NODE_ENV !== "production";
const DialDock = IS_DEV ? dynamic(() => import("./dial-dock.tsx").then((mod) => mod.default), { ssr: false }) : null;
// Registers the card-glow knobs into that same dock. Mounted here rather than
// in a section because the glow renders in two of them and it drives both
// through :root.
const CardGlowDials = IS_DEV
  ? dynamic(() => import("./sections/card-glow-dials.tsx").then((mod) => mod.default), { ssr: false })
  : null;

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
    {DialDock && <DialDock />}
    {CardGlowDials && <CardGlowDials />}
    <Hero hasSession={hasSession} />
    {/* 80px controls the gap to the section above */}
    <UnderstandWhy className="md:mt-[calc(80px-(100vh-760px)/2)]" />
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
        <div className="flex flex-col w-full gap-[200px]">
          <BuiltForProduction />
          <OpenSource />
          <Compliance />
        </div>
        <CTA />
      </div>
    </div>
    <Footer />
  </div>
);

export default Landing;
