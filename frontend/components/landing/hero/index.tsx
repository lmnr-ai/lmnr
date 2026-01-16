"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/utils";

import Header from "../header";
import LandingButton from "../landing-button";
import InfiniteLogoCarousel from "./infinite-logo-carousel";
import ScreenshotToggleButton from "./screenshot-toggle-button";

interface Props {
  className?: string;
  hasSession: boolean;
}

type TabType = "TRACING" | "EVALS" | "ANALYSIS";

const tabImages: Record<TabType, string> = {
  TRACING: "/assets/landing/observability.png",
  EVALS: "/assets/landing/evals.png",
  ANALYSIS: "/assets/landing/dashboards.png",
};

const Hero = ({ className, hasSession }: Props) => {
  const [activeTab, setActiveTab] = useState<TabType>("TRACING");

  return (
    <div className={cn("bg-landing-surface-900 flex flex-col items-center justify-between w-full gap-4", className)}>
      <div className="flex flex-col items-center justify-between pt-8 px-[48px] h-[calc(75dvh)] w-full">
        <Header hasSession={hasSession} />
        <div className="flex flex-col gap-10 items-center left-1/2 top-[247px]  w-full">
          <div className="flex flex-col items-start w-full">
            <h1
              className={cn(
                "font-space-grotesk font-normal text-[52px] text-center text-white tracking-[-0.02em] leading-[68px]",
                "w-full text-center"
              )}
            >
              Understand why your agent failed.
              <br />
              Iterate fast to fix it
            </h1>
          </div>
          <p className="text-landing-text-400 text-center text-lg leading-7 max-w-[500px]">
            Open source observability for comprehensive tracing, execution replay, and trace analysis for AI agents.
          </p>
          <div className="flex gap-5 items-center justify-center">
            <Link href="/sign-up">
              <LandingButton variant="primary" className="w-[206px]">
                GET STARTED FREE
              </LandingButton>
            </Link>
            <Link href="https://docs.lmnr.ai" target="_blank">
              <LandingButton variant="outline" className="w-[206px]">
                READ THE DOCS
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
