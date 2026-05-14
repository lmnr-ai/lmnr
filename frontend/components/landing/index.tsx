"use client";

import { cn } from "@/lib/utils";

import Footer from "./footer";
import Hero from "./hero";
import BuiltForProduction from "./sections/built-for-production";
import ClaudeFixMyAgent from "./sections/claude-fix-my-agent";
import CTA from "./sections/cta";
import DidMyFixWork from "./sections/did-my-fix-work";
import Divider from "./sections/divider";
import GetAlerts from "./sections/get-alerts";
import HasThisIssue from "./sections/has-this-issue";
import Quote from "./sections/quote";
import TwoLinesToIntegrate from "./sections/two-lines-to-integrate";
import UnderstandWhy from "./sections/understand-why";

interface Props {
  className?: string;
  hasSession: boolean;
}

// Layout-only landing per Figma `Layout only` frame (4054:7620). Each section
// renders a placeholder visual that later stages replace with the real mocks.
const Landing = ({ className, hasSession }: Props) => (
  <div className={cn("bg-landing-surface-800 overflow-x-clip", className)}>
    <Hero hasSession={hasSession} />
    <div className="flex flex-col items-center w-full gap-[120px] pt-[100px] pb-[72px] md:pb-[120px] relative">
      <div className="rounded-t-md h-[60vh] bg-gradient-to-b from-landing-surface-700 to-transparent max-w-[960px] absolute top-0 w-full" />
      <GetAlerts className="z-10" />
      <UnderstandWhy />
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
    <Footer />
  </div>
);

export default Landing;
