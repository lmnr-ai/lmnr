"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

import Header from "../header";
import LandingButton from "../landing-button";
import InfiniteLogoCarousel from "./infinite-logo-carousel";
import ScreenshotToggleButton from "./screenshot-toggle-button";

interface Props {
  className?: string;
}

type TabType = "TRACING" | "EVALS" | "ANALYSIS";

const tabImages: Record<TabType, string> = {
  TRACING: "/assets/landing/observability.png",
  EVALS: "/assets/landing/evals.png",
  ANALYSIS: "/assets/landing/dashboards.png",
};

const Hero = ({ className }: Props) => {
  const [activeTab, setActiveTab] = useState<TabType>("TRACING");

  return (
    <div className={cn("bg-landing-surface-900 flex flex-col items-center justify-between w-full gap-4", className)}>
      <div className="flex flex-col items-center justify-between pt-8 px-[48px] h-[calc(75dvh)] w-full">
        {/*TODO: hasSession for real*/}
        <Header hasSession={true} />
        <div className="flex flex-col gap-10 items-center left-1/2 top-[247px]  w-full">
          <div className="flex flex-col items-start">
            <h1
              className={cn(
                "font-space-grotesk font-normal text-[64px] text-center text-white tracking-[-1.28px] leading-[72px]",
                "w-[833px]"
              )}
            >
              Developers build reliable
              <br />
              agents with Laminar
            </h1>
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
      <div className="flex flex-col w-full pb-[120px] gap-[40px] items-center">
        <div className="relative w-[990px] h-[700px] rounded-lg overflow-hidden outline-[4px] outline-offset-4 outline-white/10">
          <Image src={tabImages[activeTab]} alt={`${activeTab} screenshot`} fill className="object-cover" priority />
        </div>
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
