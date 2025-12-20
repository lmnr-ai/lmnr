"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { useState } from "react";

import Header from "../Header";
import LandingButton from "../LandingButton";
import PlaceholderImage from "../PlaceholderImage";
import InfiniteLogoCarousel from "./InfiniteLogoCarousel";
import ScreenshotToggleButton from "./ScreenshotToggleButton";

interface Props {
  className?: string;
}

type TabType = "TRACING" | "EVALS" | "ANALYSIS";

const Hero = ({ className }: Props) => {
  const [activeTab, setActiveTab] = useState<TabType>("TRACING");

  return (
    <div className={cn("bg-landing-surface-900 flex flex-col items-center justify-between w-full", className)}>
      <div className="flex flex-col items-center justify-between pt-8 px-[48px] h-[calc(75dvh)] w-full">
        {/*TODO: hasSession for real*/}
        <Header hasSession={true} />
        <div className="flex flex-col gap-10 items-center left-1/2 top-[247px]  w-full">
          <div className="flex flex-col items-start">
            <div
              className={cn(
                "font-space-grotesk font-normal text-[64px] text-center text-white tracking-[-1.28px]",
                "w-[833px]"
              )}
            >
              <p className="leading-[72px]">Developers build reliable</p>
              <p className="leading-[72px]">agents with Laminar</p>
            </div>
          </div>
          <div className="flex gap-5 items-center justify-center">
            <Link href="https://docs.lmnr.ai" target="_blank">
              <LandingButton variant="outline" className="w-[206px]">
                READ THE DOCS
              </LandingButton>
            </Link>
            <Link href="/sign-up">
              <LandingButton variant="primary" className="w-[206px]">
                GET STARTED FREE
              </LandingButton>
            </Link>
          </div>
          <InfiniteLogoCarousel />
        </div>
      </div>
      <div className="flex flex-col w-full pb-[120px] gap-[80px] items-center">
        <PlaceholderImage className="w-[1100px] h-[600px]" />
        {/* Centered title and buttons */}
        <div className="flex gap-5 items-center">
          <ScreenshotToggleButton isActive={activeTab === "TRACING"} onClick={() => setActiveTab("TRACING")}>
            TRACING
          </ScreenshotToggleButton>
          <ScreenshotToggleButton isActive={activeTab === "EVALS"} onClick={() => setActiveTab("EVALS")}>
            EVALS
          </ScreenshotToggleButton>
          <ScreenshotToggleButton isActive={activeTab === "ANALYSIS"} onClick={() => setActiveTab("ANALYSIS")}>
            ANALYSIS
          </ScreenshotToggleButton>
        </div>
      </div>
    </div>
  );
};

export default Hero;
