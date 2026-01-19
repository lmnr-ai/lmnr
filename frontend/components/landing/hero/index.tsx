"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import Header from "../header";
import LandingButton from "../landing-button";
import InfiniteLogoCarousel from "./infinite-logo-carousel";
import ScreenshotToggleButton from "./screenshot-toggle-button";

const PROGRESS_DURATION_MS = 3000;
const FADE_DURATION_MS = 300;

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
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [displayedImage, setDisplayedImage] = useState(tabConfig["TRACING"].images[0]);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentImage = tabConfig[activeTab].images[activeImageIndex];

  // Handle fade transition when currentImage changes
  useEffect(() => {
    if (currentImage !== displayedImage) {
      // Clear any pending transition
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }

      // Start fade out
      setIsTransitioning(true);

      // After fade completes, update displayed image
      transitionTimeoutRef.current = setTimeout(() => {
        setDisplayedImage(currentImage);
        setIsTransitioning(false);
      }, FADE_DURATION_MS);
    }

    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, [currentImage, displayedImage]);

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
    <div
      className={cn(
        "bg-landing-surface-900 flex flex-col items-center justify-between w-full md:gap-[160px]",
        "gap-[80px]",
        className
      )}
    >
      <div className="flex flex-col h-[100dvh] w-full">
        <Header hasSession={hasSession} isIncludePadding />
        <div className={cn("flex flex-col items-center justify-between flex-1 md:px-[48px]", "px-4")}>
          <div className={cn("flex flex-col md:gap-[60px] items-center flex-1 justify-center", "gap-8")}>
            <div className={cn("flex flex-col md:gap-4 items-center", "gap-3")}>
              <Link
                href="https://www.ycombinator.com/companies/laminar"
                target="_blank"
                className={cn(
                  "flex gap-3 items-center bg-landing-surface-700 md:px-5 md:py-2 rounded-sm",
                  "px-3 py-1.5"
                )}
              >
                <Image src="/assets/landing/y-combinator.svg" alt="Y Combinator" width={20} height={20} />
                <span className={cn("font-chivo-mono md:text-sm text-landing-text-300 tracking-[0.02em]", "text-xs")}>
                  BACKED BY Y COMBINATOR
                </span>
              </Link>
              <h1
                className={cn(
                  "font-space-grotesk font-normal md:text-[48px] text-center text-white md:tracking-[-0.96px] md:leading-[64px]",
                  "text-[28px] tracking-[-0.56px] leading-[38px]"
                )}
              >
                Understand why your agent failed.
                <br />
                Iterate fast to fix it.
              </h1>
              <p className={cn("text-landing-text-300 text-center md:text-lg md:leading-6", "text-sm leading-5")}>
                Open source observability for comprehensive tracing, execution replay,
                <br className="hidden md:block" />
                and trace analysis for AI agents.
              </p>
            </div>
            <div className={cn("flex md:flex-row md:gap-5 items-center justify-center", "gap-2")}>
              <Link href="/sign-up" className="md:w-auto w-full">
                <LandingButton variant="primary" className={cn("md:w-[206px]", "flex-1 basis-0")}>
                  GET STARTED
                </LandingButton>
              </Link>
              <Link href="https://docs.lmnr.ai" target="_blank" className="md:w-auto w-full">
                <LandingButton variant="outline" className={cn("md:w-[206px]", "flex-1 basis-0")}>
                  READ THE DOCS
                </LandingButton>
              </Link>
            </div>
          </div>
          <InfiniteLogoCarousel />
        </div>
      </div>
      <div className={cn("flex flex-col w-full md:pb-[120px] md:gap-[40px] items-center", "pb-[60px] gap-[24px] px-4")}>
        <div className={cn("flex md:gap-5 items-center", "gap-2")}>
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
        <div
          className={cn(
            "relative md:w-[990px] md:h-[700px] rounded-lg overflow-hidden md:outline-[4px] md:outline-offset-4 outline-white/10",
            "w-full aspect-[990/700] outline-[2px] outline-offset-2"
          )}
        >
          {/* Background image - shows the target image during transition */}
          <Image src={currentImage} alt={`${activeTab} screenshot`} fill className="object-cover" priority />
          {/* Foreground image - fades out to reveal background */}
          <Image
            src={displayedImage}
            alt={`${activeTab} screenshot`}
            fill
            className={cn("object-cover transition-opacity ease-in-out", isTransitioning ? "opacity-0" : "opacity-100")}
            style={{ transitionDuration: `${FADE_DURATION_MS}ms` }}
            priority
          />
        </div>
      </div>
    </div>
  );
};

export default Hero;
