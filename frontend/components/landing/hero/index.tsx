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
const CLICK_DURATION_MS = 6000;
const FADE_DURATION_MS = 300;

interface Props {
  className?: string;
  hasSession: boolean;
}

type TabType = "Tracing" | "Debugger" | "Signals" | "Evals" | "SQL";

const tabConfig: Record<TabType, { images: string[] }> = {
  Tracing: { images: ["/assets/landing/tracing.png"] },
  Debugger: { images: ["/assets/landing/debugger.png"] },
  Signals: { images: ["/assets/landing/signals-1.png", "/assets/landing/signals-2.png"] },
  Evals: { images: ["/assets/landing/evals-1.png", "/assets/landing/evals-2.png"] },
  SQL: { images: ["/assets/landing/sql.png"] },
};

const TABS: TabType[] = ["Tracing", "Signals", "Debugger", "Evals", "SQL"];

const Hero = ({ className, hasSession }: Props) => {
  const [activeTab, setActiveTab] = useState<TabType>("Tracing");
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [displayedImage, setDisplayedImage] = useState(tabConfig["Tracing"].images[0]);
  const [progressDuration, setProgressDuration] = useState(PROGRESS_DURATION_MS);
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
    setProgressDuration(CLICK_DURATION_MS);
  }, []);

  const handleSegmentClick = useCallback((tab: TabType, index: number) => {
    setActiveTab(tab);
    setActiveImageIndex(index);
    setProgressDuration(CLICK_DURATION_MS);
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
    setProgressDuration(PROGRESS_DURATION_MS);
  }, [activeTab, activeImageIndex]);

  return (
    <div
      className={cn(
        "bg-landing-surface-900 flex flex-col items-center justify-between w-full md:gap-[160px]",
        "gap-[80px]",
        className
      )}
    >
      <div className="flex flex-col h-dvh w-full">
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
                <span className={cn("font-sans md:text-sm text-landing-text-300 tracking-[0.02em]", "text-xs")}>
                  Backed by Y Combinator
                </span>
              </Link>
              <h1
                className={cn(
                  "font-space-grotesk md:text-[56px] text-center text-white md:tracking-[-1.5px] md:leading-[72px]",
                  "text-[32px] tracking-[-0.56px] leading-[38px]"
                )}
              >
                Understand why your agent failed.
                <br />
                Iterate fast to fix it.
              </h1>
              <p
                className={cn(
                  "text-secondary-foreground text-center md:text-xl md:leading-8 xl:mt-8 lg:mt-6 font-base",
                  "text-sm leading-5 mt-4"
                )}
              >
                Open-source observability platform for agent tracing,
                <br className="hidden md:block" />
                evals, and signal extraction from traces at scale.
              </p>
            </div>
            <div className={cn("flex md:flex-row md:gap-5 items-center justify-center", "gap-2")}>
              <Link href="/sign-up" className="md:w-auto w-full">
                <LandingButton variant="primary" size="lg" className={cn("md:w-[206px]", "flex-1 basis-0")}>
                  Get Started
                </LandingButton>
              </Link>
              <Link href="https://docs.laminar.sh" target="_blank" className="md:w-auto w-full">
                <LandingButton size="lg" variant="outline" className={cn("md:w-[206px]", "flex-1 basis-0")}>
                  Read the Docs
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
              progressDuration={progressDuration}
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
            "relative lg:max-w-[1100px] md:max-w-[990px] w-full rounded-lg overflow-hidden md:outline-[4px] md:outline-offset-4 outline-white/10",
            "outline-[2px] outline-offset-2"
          )}
        >
          {/* Background image - shows the target image during transition */}
          <Image
            src={currentImage}
            alt={`${activeTab} screenshot`}
            width={0}
            height={0}
            sizes="100vw"
            className="w-full h-auto"
            priority
          />
          {/* Foreground image - fades out to reveal background */}
          <Image
            src={displayedImage}
            alt={`${activeTab} screenshot`}
            width={800}
            height={600}
            sizes="100vw"
            className={cn(
              "w-full h-auto absolute inset-0 transition-opacity ease-in-out",
              isTransitioning ? "opacity-0" : "opacity-100"
            )}
            style={{ transitionDuration: `${FADE_DURATION_MS}ms` }}
            priority
          />
        </div>
      </div>
    </div>
  );
};

export default Hero;
