"use client";

import MuxPlayer from '@mux/mux-player-react';
import { ArrowUpRight } from "lucide-react";
import Image, { StaticImageData } from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";

import evals from "@/assets/landing/evals.png";
import evals2 from "@/assets/landing/evals2.png";
import iterate from "@/assets/landing/iterate.png";
import labeling from "@/assets/landing/labeling.png";
import observability from "@/assets/landing/observability.png";
import observe from "@/assets/landing/observe.png";
import playground from "@/assets/landing/playground.png";
import query from "@/assets/landing/query.png";
import yc from "@/assets/landing/yc.svg";
import { IconBrowserUse, IconPlaywright } from "@/components/ui/icons";

import { Button } from "../ui/button";
import FeatureCard from "./feature-card";
import Footer from "./footer";
import FrameworksGrid from "./frameworks-grid";
import InfiniteLogoCarousel from "./infinite-logo-carousel";


interface Section {
  id: string;
  title: string;
  description: string;
  docsLink: string;
  callToAction: string;
}

interface ImageItem {
  id: number;
  image: StaticImageData;
  sectionId: string;
  nextImage: StaticImageData;
  indexInSection: number;
}

const sections: Section[] = [
  {
    id: "traces",
    title: "Observability",
    description: `Tracing is the most crucial component in debugging and improving your AI app. It brings visibility into every
    execution step while collecting valuable data for evaluations and fine-tuning.
    With Laminar, you can start tracing with a single line of code.`,
    docsLink: "https://docs.lmnr.ai/tracing/introduction",
    callToAction: "Start tracing your LLM app",
  },
  {
    id: "evals",
    title: "Evals",
    description: `Evals are unit tests for your AI app. 
    They help you answer questions like "Did my last change improve the performance?".
    With Laminar, you can run custom evals via code, CLI, or CI/CD pipeline.`,
    docsLink: "https://docs.lmnr.ai/evaluations/introduction",
    callToAction: "Bring rigor to your LLM app",
  },
  {
    id: "playground",
    title: "Playground",
    description: `Playground is a tool that allows you to test your LLM app.`,
    docsLink: "https://docs.lmnr.ai/playground/introduction",
    callToAction: "Try out Laminar Playground",
  },
  {
    id: "labeling",
    title: "Labeling",
    description: `Labeling is a tool that allows you to label your data.`,
    docsLink: "https://docs.lmnr.ai/labeling/introduction",
    callToAction: "Label your data",
  },
];

// Flat list of all images with their section IDs and pre-calculated next images
const allImages: ImageItem[] = [
  { id: 0, image: observability, sectionId: "traces", nextImage: evals, indexInSection: 0 },
  { id: 1, image: evals, sectionId: "evals", nextImage: evals2, indexInSection: 0 },
  { id: 2, image: evals2, sectionId: "evals", nextImage: playground, indexInSection: 1 },
  { id: 3, image: playground, sectionId: "playground", nextImage: labeling, indexInSection: 0 },
  { id: 4, image: labeling, sectionId: "labeling", nextImage: observability, indexInSection: 0 },
];

const AUTO_ROTATE_INTERVAL = 2500;
const AUTO_ROTATE_INTERVAL_AFTER_TRANSITION = 5000;

export default function Landing() {
  const [currentImagePointer, setCurrentImagePointer] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionTargetImage, setTransitionTargetImage] = useState<StaticImageData | null>(null);

  // Derived state
  const currentImageItem = allImages[currentImagePointer];
  const currentSection = sections.find(section => section.id === currentImageItem?.sectionId) || sections[0];

  // Get images for current section for indicator dots
  const currentSectionImages = allImages.filter(img => img.sectionId === currentSection.id);
  const currentImageIndexInSection = currentImageItem.indexInSection;

  const handleSectionSelect = (section: Section) => {
    if (section.id === currentSection.id) return;

    // Find the first image of the selected section
    const firstImageOfSection = allImages.findIndex(img => img.sectionId === section.id);
    if (firstImageOfSection !== -1) {
      const targetImageItem = allImages[firstImageOfSection];
      setTransitionTargetImage(targetImageItem.image);
      setIsTransitioning(true);
      setAutoRotate(false);

      setTimeout(() => {
        setCurrentImagePointer(firstImageOfSection);
        setTransitionTargetImage(null);
        setIsTransitioning(false);
      }, 250);

      setTimeout(() => {
        setAutoRotate(true);
      }, AUTO_ROTATE_INTERVAL_AFTER_TRANSITION);
    }
  };


  const handleImageIndicatorClick = (index: number) => {
    if (index === currentImageIndexInSection) return;

    // Find the specific image in the current section
    const targetImageItem = currentSectionImages[index];
    const targetPointer = allImages.findIndex(img => img.id === targetImageItem.id);

    if (targetPointer !== -1) {
      setTransitionTargetImage(targetImageItem.image);
      setIsTransitioning(true);
      setAutoRotate(false);

      setTimeout(() => {
        setCurrentImagePointer(targetPointer);
        setTransitionTargetImage(null);
        setIsTransitioning(false);
      }, 250);

      setTimeout(() => {
        setAutoRotate(true);
      }, AUTO_ROTATE_INTERVAL_AFTER_TRANSITION);
    }
  };

  // Auto-rotate through all images
  useEffect(() => {
    if (!autoRotate) return;

    const timer = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentImagePointer((current) => (current + 1) % allImages.length);
        setIsTransitioning(false);
      }, 250);
    }, AUTO_ROTATE_INTERVAL);

    return () => clearInterval(timer);
  }, [autoRotate]);


  return (
    <>
      <div className="flex flex-col z-30 items-center pt-28 space-y-8">
        <div className="flex flex-col w-full xl:max-w-[1200px] 2xl:max-w-[1400px] space-y-8">
          <div className="flex flex-col w-full">
            <div className="flex flex-col items-start md:items-center py-6 md:py-16 relative">
              <div className="z-20 flex flex-col items-center gap-8 md:gap-6">
                <p className="px-4 md:px-0 text-[2rem] leading-tight text-left md:text-center tracking-tight md:text-[3.5rem] md:leading-tight text-white font-semibold animate-in fade-in duration-300 font-title">
                  How developers build reliable AI agents.
                </p>
                <p className="px-4 md:px-0 text-lg md:text-2xl text-white/85 font-semibold tracking-normal font-title text-left md:text-center">
                  The single open-source platform to trace, evaluate, and analyze AI agents.
                </p>
                <div className="flex space-x-4 items-center">
                  <Link href="/sign-up">
                    <Button className="w-40 h-10 text-base border-none">Get started - free</Button>
                  </Link>
                  <Link target="_blank" href="https://docs.lmnr.ai">
                    <Button
                      className="w-40 h-10 border-none text-base"
                      variant="secondary"
                    >
                      Read the docs
                    </Button>
                  </Link>
                </div>
                <div className="flex justify-center items-center gap-4 flex-col mt-2 md:mt-4">
                  <span className="text-sm text-white">Backed by</span>
                  <Image src={yc} alt="backed by Y Combinator" className="w-32 sm:w-40 md:w-60" />
                </div>
                <div className="mt-8 md:mt-12 w-full 2xl:pt-32">
                  <InfiniteLogoCarousel />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center bg-[#de6f43] w-full">
          <div className="flex flex-col w-full max-w-full xl:max-w-[1000px] 2xl:max-w-[1400px]">

            <div className="flex flex-col w-full relative md:pb-0 rounded">
              <div
                className="z-20 col-span-2 pt-8"
              >
                <div className="flex flex-wrap border-none gap-2 sm:gap-4 col-span-1 overflow-x-auto justify-center text-sm md:text-lg font-semibold tracking-wide font-title">
                  {sections.map((section, i) => (
                    <button
                      key={i}
                      onClick={() => handleSectionSelect(section)}
                      className={`h-6 md:h-8 px-2 sm:px-3 rounded-md transition-colors duration-200 items-center flex whitespace-nowrap ${currentSection.id === section.id
                        ? "bg-white/20 text-white"
                        : "text-white/80 hover:text-white"
                      }`}
                    >
                      {section.title}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col h-8 pt-4 items-center">
                  {currentSectionImages.length > 1 && (
                    <div className="flex space-x-2">
                      {currentSectionImages.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => handleImageIndicatorClick(index)}
                          className={`w-2 h-2 rounded-full transition-all duration-200 ${index === currentImageIndexInSection
                            ? "bg-white"
                            : "bg-white/40 hover:bg-white/60"
                          }`}
                          aria-label={`View image ${index + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="px-4 md:px-0">
                  <div className="relative">
                    <Image
                      alt="background"
                      src={transitionTargetImage || currentImageItem.nextImage}
                      priority={false}
                      quality={100}
                      className="rounded md:rounded-lg w-full bg-background xl:h-[700px] 2xl:h-[950px] object-cover object-top"
                    />
                    <Image
                      key={currentImageItem.id}
                      alt="foreground"
                      src={currentImageItem.image}
                      priority
                      quality={100}
                      className={`absolute inset-0 rounded md:rounded-lg w-full bg-background xl:h-[700px] 2xl:h-[950px] object-cover object-top transition-opacity duration-500 ease-in-out ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}
                    />
                  </div>
                </div>
              </div>
              <div className="px-4 md:px-0">
                <h1 className="text-2xl md:text-[2.4rem] font-bold tracking-normal font-title text-white py-16 md:py-32 leading-tight">
                  With Laminar, teams monitor agents in production, <br />
                  understand failure modes, and create evals to improve agent performance
                </h1>
                <span className="text-white/80 text-base font-semibold font-title">
                  Why teams choose Laminar
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-16 my-8 md:mb-24 mb-16">
                  <FeatureCard
                    title="Fully Open-Source"
                    subtitle="Self-host or use our cloud. Transparent, extensible, and community-driven."
                  />
                  <FeatureCard
                    title="Highly scalable"
                    subtitle="Rust-powered, optimized for performance and scalability, capable of ingesting hundreds of millions of traces per day."
                  />
                  <FeatureCard
                    title="SQL access to all data"
                    subtitle="Analyze traces, metrics, and events with a built-in SQL editor. Bulk create datasets from queries."
                    className="hidden md:block"
                  />
                  <FeatureCard
                    title="Powerful SDK"
                    subtitle="With Laminar best-in-class SDK you can easily trace your agents and write powerful evals."
                    className="hidden md:block"
                  />
                  <FeatureCard
                    title="Custom dashboards"
                    subtitle="Turn SQL queries into custom dashboards to track custom metrics of your agent."
                    className="hidden md:block"
                  />
                  <FeatureCard
                    title="Affordable at scale"
                    subtitle="Start with a generous free tier, and scale without breaking the bank. No limit on the amount of spans you can ingest."
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col w-full max-w-full xl:max-w-[1200px] md:pt-8 2xl:pt-32">
          <div className="flex items-center justify-center flex-col">
            <div className="p-6 flex flex-col h-full gap-8 max-w-[900px]">
              <p className="text-3xl md:text-[2.4rem] leading-normal text-white text-center font-title font-bold">"Laminar's evals help us maintain high accuracy while moving fast. We now use them for every LLM based feature we build."</p>
            </div>
            <div>
              <p className="text-white font-medium">Hashim Rehman</p>
              <p className="text-white/60 text-sm">
                CTO, Remo
              </p>
            </div>
          </div>
        </div>
        <CoreSections />
        <div className="flex flex-col w-full max-w-full xl:max-w-[1200px] md:pb-16 items-center">
          <div className="flex flex-col w-full items-center gap-6">
            <p className="text-3xl md:text-4xl text-white text-center font-title font-semibold px-4 md:px-0">
              Start building reliable AI agents today.
            </p>
            <div className="flex space-x-4 items-center">
              <Link href="/sign-up">
                <Button className="w-40 h-10 text-base border-none">Get started - free</Button>
              </Link>
              <Link target="_blank" href="https://docs.lmnr.ai">
                <Button
                  className="w-40 h-10 border-none text-base"
                  variant="secondary"
                >
                  Read the docs
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
}

function CoreSections() {
  const [activeSection, setActiveSection] = useState<string>("frameworks");
  const sectionRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + window.innerHeight / 2;

      // Find which section is currently in view
      Object.entries(sectionRefs.current).forEach(([key, ref]) => {
        if (ref) {
          const rect = ref.getBoundingClientRect();
          const top = rect.top + window.scrollY;
          const bottom = top + rect.height;

          if (scrollPosition >= top && scrollPosition <= bottom) {
            if (activeSection !== key) {
              setActiveSection(key);
            }
          }
        }
      });
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll(); // Check initial position

    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeSection]);

  const renderLeftContent = () => {
    const contents = {
      frameworks: (
        <div className="flex w-full items-center justify-center p-8">
          <FrameworksGrid
            gridClassName="grid grid-cols-4 gap-4 2xl:gap-8 items-center justify-center w-full"
            labelTextColor="text-white/70"
          />
        </div>
      ),
      observe: (
        <Image
          src={observe}
          alt="Observe"
          className="w-[600px] 2xl:w-[800px] h-full object-cover object-top"
          quality={100}
        />
      ),
      browser: (
        <div className="flex overflow-hidden">
          <MuxPlayer
            playbackId="N2QzSAaeGCvsJ4lzAw2MOIpRPDx7YzFQsZG02fSlUj7g"
            metadata={{
              video_title: "Browser session capture",
            }}
            autoPlay={true}
            muted={true}
            loop={true}
            thumbnailTime={0}
            style={{
              // Hide all controls at once
              '--controls': 'none',
              // Hide the error dialog
              '--dialog': 'none',
              // Hide the loading indicator
              '--loading-indicator': 'none',
              // Target all sections by excluding the section prefix
              '--play-button': 'none',
              '--live-button': 'none',
              '--seek-backward-button': 'none',
              '--seek-forward-button': 'none',
              '--mute-button': 'none',
              '--captions-button': 'none',
              '--airplay-button': 'none',
              '--pip-button': 'none',
              '--fullscreen-button': 'none',
              '--cast-button': 'none',
              '--playback-rate-button': 'none',
              '--volume-range': 'none',
              '--time-range': 'none',
              '--time-display': 'none',
              '--duration-display': 'none',
              '--rendition-menu-button': 'none',
              // Target a specific section by prefixing the CSS var with (top|center|bottom)
              '--center-controls': 'none',
              '--bottom-play-button': 'none',
            } as React.CSSProperties}
            className="xl:w-[600px] xl:h-[570px] 2xl:w-[800px] 2xl:h-[850px] border border-white/15 rounded overflow-hidden "
          />
        </div>
      ),
      query: (
        <Image
          src={query}
          alt="Query and analyze"
          className="w-[600px] xl:w-[600px] 2xl:w-[800px] h-full object-cover object-top"
          quality={100}
        />
      ),
      iterate: (
        <Image
          src={iterate}
          alt="Evaluate and iterate"
          className="w-[600px] xl:w-[600px] 2xl:w-[800px] h-full object-cover object-top"
          quality={100}
        />
      ),
    };

    return (
      <div
        key={activeSection}
        className="w-full h-full flex items-center justify-center animate-in fade-in duration-700"
      >
        {contents[activeSection as keyof typeof contents]}
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col w-full max-w-full">
        <div className="md:grid md:grid-cols-2 md:gap-16">
          <div className="hidden md:flex justify-end">
            <div className="order-1">
              <div className="sticky top-0 h-[100vh]">
                <div className="flex h-full transition-all duration-500 items-center justify-center">
                  <div className="transition-all duration-500 overflow-hidden">
                    {renderLeftContent()}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col order-2 xl:max-w-[600px]">
            <div ref={el => { sectionRefs.current["frameworks"] = el; }} className="flex flex-col md:h-[100vh] justify-center my-8 md:my-0 pt-16 md:pt-0">
              <h1 className="text-3xl md:text-4xl font-bold tracking-normal font-title text-white px-4 md:px-0">
                Integrate in 2 minutes
              </h1>
              <InfoCard
                title=""
                description="Simply initialize Laminar at the top of your project and popular LLM frameworks and SDKs will be automatically traced. Use our SDK to add comprehensive tracing to your agent."
                animationOrder={0}
                className="px-4 md:px-0"
              />
              <div className="md:hidden px-2 py-8">
                <FrameworksGrid
                  gridClassName="grid grid-cols-4"
                  labelTextColor="text-white"
                />
              </div>
            </div>
            <div ref={el => { sectionRefs.current["observe"] = el; }} className="flex flex-col md:min-h-[100vh] my-8 md:my-0">
              <h1 className="text-3xl md:text-4xl font-bold tracking-normal font-title text-white pb-8 px-4 md:px-0">
                Observe & Debug
              </h1>
              <div className="md:hidden w-full">
                <Image
                  src={observe}
                  alt="Observe"
                  className="w-full object-cover object-top"
                  quality={100}
                />
              </div>
              <div className="px-4 md:px-0">
                <InfoCard
                  title="See traces of long-running agents in real time"
                  description="Don't wait until the end of your AI agent run to start debugging. Laminar shows spans as they happen in real time."
                  animationOrder={1}
                />
                <InfoCard
                  title="Automatic error capture"
                  description="Laminar automatically captures application level exceptions."
                  animationOrder={1}
                />
                <InfoCard
                  title="Tool calls and structured output tracing"
                  description="Understand when your agent fails to use tools and to produce structured output."
                  animationOrder={1}
                />
                <InfoCard
                  title="Track custom metrics with events"
                  description="You can emit events with custom metadata from your code to track custom metrics of your agent."
                  animationOrder={1}
                />
              </div>
            </div>
            <div ref={el => { sectionRefs.current["browser"] = el; }} className="md:min-h-[100vh] flex flex-col justify-center my-8 md:my-0">
              <h1 className="text-3xl md:text-4xl font-bold tracking-normal font-title text-white px-4 md:px-0 pb-8">
                See what your browser agent sees
              </h1>
              <div className="md:hidden rounded-lg overflow-hidden">
                <MuxPlayer
                  playbackId="N2QzSAaeGCvsJ4lzAw2MOIpRPDx7YzFQsZG02fSlUj7g"
                  metadata={{
                    video_title: "Browser session capture",
                  }}
                  autoPlay={true}
                  muted={true}
                  loop={true}
                  thumbnailTime={0}
                  style={{
                    // Hide all controls at once
                    '--controls': 'none',
                    // Hide the error dialog
                    '--dialog': 'none',
                    // Hide the loading indicator
                    '--loading-indicator': 'none',
                    // Target all sections by excluding the section prefix
                    '--play-button': 'none',
                    '--live-button': 'none',
                    '--seek-backward-button': 'none',
                    '--seek-forward-button': 'none',
                    '--mute-button': 'none',
                    '--captions-button': 'none',
                    '--airplay-button': 'none',
                    '--pip-button': 'none',
                    '--fullscreen-button': 'none',
                    '--cast-button': 'none',
                    '--playback-rate-button': 'none',
                    '--volume-range': 'none',
                    '--time-range': 'none',
                    '--time-display': 'none',
                    '--duration-display': 'none',
                    '--rendition-menu-button': 'none',
                    // Target a specific section by prefixing the CSS var with (top|center|bottom)
                    '--center-controls': 'none',
                    '--bottom-play-button': 'none',
                  } as React.CSSProperties}
                  className="w-full border border-white/15 overflow-hidden"
                />
              </div>
              <InfoCard
                title=""
                description={
                  <div className="flex flex-col gap-4">
                    <p>Laminar automatically captures browser window recordings and syncs them with agent traces to help you see what the browser agent sees. Laminar automatically traces <span className="text-white font-semibold">Browser Use, Stagehand and Playwright</span>.</p>
                    <div className="flex items-center gap-4 pb-4">
                      <IconBrowserUse className="w-9 h-9 text-white" />
                      <div className="flex items-center justify-center w-10 h-10 rounded-full text-4xl">🤘</div>
                      <IconPlaywright className="w-14 h-14 text-white" />
                    </div>
                  </div>
                }
                linkUrl="https://docs.lmnr.ai/tracing/browser-agent-observability"
                actionText="Learn about browser agent observability"
                animationOrder={2}
                className="items-center px-4 md:px-0"
              >
              </InfoCard>
            </div>

            <div ref={el => { sectionRefs.current["query"] = el; }} className="flex flex-col md:min-h-[100vh] my-8 md:my-0">
              <h1 className="text-3xl md:text-4xl font-bold tracking-normal font-title text-white pb-8 px-4 md:px-0">
                Query & Analyze
              </h1>
              <div className="md:hidden w-full">
                <Image
                  src={query}
                  alt="Query and analyze"
                  className="w-full object-cover object-top"
                  quality={100}
                />
              </div>
              <div className="px-4 md:px-0">
                <InfoCard
                  title="Query all data on the platform with SQL"
                  description="Access to traces, evals, datasets, and events data on the platform with a built-in SQL editor."
                  animationOrder={0}
                />
                <InfoCard
                  title="Track what matters to you with custom dashboards"
                  description="Skip the dashboard builder. Just write SQL to create custom dashboards to track custom metrics of your agent."
                  animationOrder={0}
                />
                <InfoCard
                  title="From query to eval datasets in seconds"
                  description="Use SQL to query custom data filtered by your own criteria. Batch insert to labeling queues or directly to datasets in seconds."
                  animationOrder={2}
                  className="bg-background"
                />
                <InfoCard
                  title="Access platform data via SQL API"
                  description="Use the Laminar SQL API to query traces, evals, datasets, and events data from your own applications."
                  animationOrder={1}
                />
              </div>
            </div>
            <div ref={el => { sectionRefs.current["iterate"] = el; }} className="flex flex-col min-h-[100vh] justify-center my-8 md:my-0">
              <h1 className="text-3xl md:text-4xl font-bold tracking-normal font-title text-white px-4 md:px-0 pb-8">
                Evaluate & Iterate
              </h1>
              <div className="md:hidden w-full">
                <Image
                  src={iterate}
                  alt="Evaluate and iterate"
                  className="w-full object-cover object-top"
                  quality={100}
                />
              </div>
              <div className="px-4 md:px-0">
                <InfoCard
                  title="Zero boilerplate evaluation SDK"
                  description="Skip the setup hell. Write your agent function and evaluator, pass in your data, and run. We automatically handle parallelism and retries."
                  animationOrder={0}
                />
                <InfoCard
                  title="Iterate on prompts without touching your codebase"
                  description="Open LLM calls in the Playground. Iterate fast - test new prompts, try different models, and validate improvements."
                  animationOrder={0}
                />
                <InfoCard
                  title="Catch regressions before your users do"
                  description="See the impact of every change before it goes live. Compare evaluation runs to catch regressions early and validate that your improvements actually work."
                  animationOrder={1}
                />
                <InfoCard
                  title="Build high-quality eval datasets efficiently"
                  description="No complex labeling tools or workflows. Just queue your data and start labeling. Perfect for teams getting started with systematic evaluation."
                  animationOrder={2}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function InfoCard({
  title,
  description,
  image,
  children,
  className = "",
  linkUrl = undefined,
  actionText = undefined,
  animationOrder = 0,
}: {
  title: string;
  description: string | React.ReactNode;
  linkUrl?: string;
  actionText?: string;
  image?: StaticImageData;
  children?: React.ReactNode;
  className?: string;
  animationOrder?: number;
}) {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const baseDelay = animationOrder * 150;

  return (
    <div
      ref={ref}
      className={`grid transition-all
        relative overflow-hidden ${className}
        ${image ? "grid-cols-2" : ""}
      `}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(30px)",
        transition: `opacity 600ms ease ${baseDelay}ms, transform 600ms ease ${baseDelay}ms`,
      }}
    >
      <div className="py-8 space-y-2 flex flex-col">
        {title && title !== "" && <h3
          className="text-2xl font-semibold transition-all tracking-normal font-title"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? "translateX(0)" : "translateX(-10px)",
            transition: `opacity 500ms ease ${baseDelay + 100}ms, transform 500ms ease ${baseDelay + 100}ms`,
          }}
        >
          {title}
        </h3>}
        <div
          className="text-secondary-foreground/80 transition-all text-base font-semibold tracking-normal font-title"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? "translateX(0)" : "translateX(-10px)",
          }}
        >
          {description}
        </div>
        {linkUrl && (
          <div
            style={{
              opacity: inView ? 1 : 0,
              transform: inView ? "translateY(0)" : "translateY(10px)",
              transition: `opacity 500ms ease ${baseDelay + 400}ms, transform 500ms ease ${baseDelay + 400}ms`,
            }}
          >
            <Link href={linkUrl} target="_blank" className="flex flex-col items-start">
              <div className="flex items-center rounded p-1 px-2 text-sm border border-white/20">
                {actionText} <ArrowUpRight className="ml-2 h-4 w-4" />
              </div>
            </Link>
          </div>
        )}
        {children && inView && (
          <div
            style={{
              opacity: inView ? 1 : 0,
              transition: `opacity 500ms ease ${baseDelay + 300}ms`,
            }}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
