"use client";

import { cn } from "@/lib/utils";

import { bodyLarge, subsectionTitle } from "../../class-names_old";
import DocsButton from "../../docs-button";
import SignalsSectionDesktop from "./signals-section-desktop";
import SignalsSectionMobile from "./signals-section-mobile";
import SlackNotifications from "./slack-notifications";

interface Props {
  className?: string;
}

const TITLE = "One million agent runs, what went wrong?";
const SUBTITLE = "Signals answer any question about your agents at scale";

const SignalsSection = ({ className }: Props) => (
  <div className={cn("flex flex-col md:gap-[54px] items-start w-full gap-8", className)}>
    <div className="hidden md:flex flex-col gap-[54px] items-start w-full">
      <div className="flex flex-col gap-1 items-start w-full">
        <h2 className={subsectionTitle}>{TITLE}</h2>
        <p className={bodyLarge}>{SUBTITLE} </p>
      </div>
      <SignalsSectionDesktop />
    </div>

    <div className="md:hidden flex flex-col gap-8 w-full">
      <div className="flex flex-col gap-1 items-start w-full">
        <h2 className={subsectionTitle}>{TITLE}</h2>
        <p className={bodyLarge}>{SUBTITLE} </p>
      </div>
      <SignalsSectionMobile />
    </div>

    <SlackNotifications />
    <DocsButton href="https://laminar.sh/docs/signals#signals" />
  </div>
);

export default SignalsSection;
