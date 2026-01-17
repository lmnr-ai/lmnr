"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";

import Header from "../header";
import LandingButton from "../landing-button";
import InfiniteLogoCarousel from "./infinite-logo-carousel";
import ScreenshotToggleButton from "./screenshot-toggle-button";

const PROGRESS_DURATION_MS = 3000;

interface Props {
  className?: string;
  hasSession: boolean;
}

type TabType = "TRACING" | "EVALS" | "ANALYSIS";

const tabConfig: Record<TabType, { images: string[] }> = {
  TRACING: { images: ["/assets/landing/observability.png"] },
  EVALS: { images: ["/assets/landing/evals.png", "/assets/landing/observability.png"] },
  ANALYSIS: { images: ["/assets/landing/dashboards.png"] },
};

const TABS: TabType[] = ["TRACING", "EVALS", "ANALYSIS"];

const Hero = ({ className, hasSession }: Props) => {
  const [activeTab, setActiveTab] = useState<TabType>("TRACING");
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const currentImage = tabConfig[activeTab].images[activeImageIndex];

  const handleTabClick = useCallback((tab: TabType) => {
    setActiveTab(tab);
    setActiveImageIndex(0);
  }, []);

  const handleSegmentClick = useCallback((tab: TabType, index: number) => {
    setActiveTab(tab);
    setActiveImageIndex(index);
  }, []);

  const handleProgressComplete = useCallback(() => {
    const config = tabConfig[activeTab];
    if (activeImageIndex < config.images.length - 1) {
      // More images in current tab
      setActiveImageIndex(activeImageIndex + 1);
    } else {
      // Move to next tab
      const currentIndex = TABS.indexOf(activeTab);
      const nextTab = TABS[(currentIndex + 1) % TABS.length];
      setActiveTab(nextTab);
      setActiveImageIndex(0);
    }
  }, [activeTab, activeImageIndex]);

  return (
    <div className={cn("bg-landing-surface-900 flex flex-col items-center justify-between w-full gap-[160px]", className)}>
      <div className="flex flex-col items-center justify-between pt-8 px-[48px] h-[100dvh] w-full">
        <Header hasSession={hasSession} />
        <div className="flex flex-col gap-[60px] items-center">
          <div className="flex flex-col gap-4 items-center">
            <Link
              href="https://www.ycombinator.com/companies/laminar"
              target="_blank"
              className="flex gap-3 items-center bg-landing-surface-700 px-5 py-2 rounded-sm"
            >
              <Image src="/assets/landing/y-combinator.svg" alt="Y Combinator" width={20} height={20} />
              <span className="font-chivo-mono text-sm text-landing-text-300 tracking-[0.02em]">
                BACKED BY Y COMBINATOR
              </span>
            </Link>
            <h1 className="font-space-grotesk font-normal text-[48px] text-center text-white tracking-[-0.96px] leading-[64px]">
              Understand why your agent failed.
              <br />
              Iterate fast to fix it.
            </h1>
            <p className="text-landing-text-300 text-center text-base leading-6">
              Open source observability for comprehensive tracing, execution replay,
              <br />
              and trace analysis for AI agents.
            </p>
          </div>
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
        </div>
        <InfiniteLogoCarousel />
      </div>
      <div className="flex flex-col w-full pb-[120px] gap-[40px] items-center">
        <div className="flex gap-5 items-center">
          {TABS.map((tab) => (
            <ScreenshotToggleButton
              key={`${tab}-${activeTab === tab ? activeImageIndex : 0}`}
              isActive={activeTab === tab}
              imageCount={tabConfig[tab].images.length}
              activeImageIndex={activeTab === tab ? activeImageIndex : 0}
              progressDuration={PROGRESS_DURATION_MS}
              onProgressComplete={handleProgressComplete}
              onSegmentClick={(index) => handleSegmentClick(tab, index)}
              onClick={() => handleTabClick(tab)}
            >
              {tab}
            </ScreenshotToggleButton>
          ))}
        </div>
        <div className="relative w-[990px] h-[700px] rounded-lg overflow-hidden outline-[4px] outline-offset-4 outline-white/10">
          <Image src={currentImage} alt={`${activeTab} screenshot`} fill className="object-cover" priority />
        </div>
      </div>
    </div>
  );
};

export default Hero;
