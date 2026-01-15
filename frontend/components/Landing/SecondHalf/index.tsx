"use client";

import { cn } from "@/lib/utils";
import { sectionHeaderLarge, bodyLarge } from "../classNames";
import DocsButton from "../DocsButton";
import SystemDiagram from "./SystemDiagram";
import LocalToScaleImage from "./LocalToScaleImage";
import { useScroll } from "framer-motion";
import { useRef } from "react";

interface Props {
  className?: string;
}

const SecondHalf = ({ className }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "end center"],
  });

  return (
    <div
      className={cn(
        "bg-landing-surface-800 flex flex-col gap-[240px] items-center justify-center py-[280px] px-0 w-full",
        className
      )}
    >
      {/* Local to Scale combined section */}
      <div ref={containerRef} className="relative w-[1164px] flex justify-between">
        {/* Left column - scrolls normally */}
        <div className="flex flex-col gap-[240px] w-[500px] pb-[100px] pt-[20px]">
          {/* Try it local, free section */}
          <div className="flex flex-col gap-6 items-start">
            <h2 className={cn(sectionHeaderLarge, "text-justify whitespace-nowrap")}>Try it local, free</h2>
            <div className="flex flex-col items-start w-[380px]">
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                <p className={cn(bodyLarge, "basis-0 grow min-h-px min-w-px shrink-0")}>
                  Set up with Docker in three lines
                </p>
              </div>
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                <p className={cn(bodyLarge, "basis-0 grow min-h-px min-w-px shrink-0")}>Open source</p>
              </div>
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                <p className={cn(bodyLarge, "basis-0 grow min-h-px min-w-px shrink-0")}>Self-host anywhere</p>
              </div>
            </div>
            <DocsButton href="https://docs.laminar.sh/hosting-options" />
          </div>

          {/* Ready to scale section */}
          <div className="flex flex-col gap-6 items-start w-[437px]">
            <h2 className={cn(sectionHeaderLarge, "text-justify whitespace-nowrap")}>
              Ready to scale?
              <br />
              We got you.
            </h2>
            <div className="flex flex-col items-start w-full">
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                <p className={cn(bodyLarge, "basis-0 grow min-h-px min-w-px shrink-0")}>Affordable hosted solution</p>
              </div>
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                <p className={cn(bodyLarge, "basis-0 grow min-h-px min-w-px shrink-0")}>Workspace members and roles</p>
              </div>
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                <p className={cn(bodyLarge, "basis-0 grow min-h-px min-w-px shrink-0")}>Terabytes of data with ease</p>
              </div>
            </div>
            <DocsButton href="/pricing" label="PRICING" />
          </div>
        </div>

        {/* Right column - sticky */}
        <div className="relative">
          <div className="sticky top-[calc(50vh-200px)] h-[400px]">
            <LocalToScaleImage
              className="top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2"
              scrollYProgress={scrollYProgress}
            />
          </div>
        </div>
      </div>

      {/* Production-grade section */}
      <div className="flex gap-10 items-center relative shrink-0 w-full pl-[calc((100%-1142px)/2)] ">
        <div className="basis-0 flex flex-col gap-[37px] grow items-start min-h-px min-w-px relative shrink-0">
          <div className="flex flex-col items-start relative shrink-0">
            <h2 className={cn(sectionHeaderLarge, "leading-[54px] whitespace-nowrap")}>
              Production-grade
              <br />
              to the core
            </h2>
          </div>
          <p className="font-sans font-normal leading-6 text-base text-landing-text-200 w-[394px]">
            Built in Rust and mega-optimized for performance. Terabytes of trace data in production without slowing
            down.
            <br />
            <br />
            SOC2 and HIPAA compliant.
          </p>
          <div className="flex gap-5 items-start relative shrink-0">
            <div className="bg-landing-surface-600 size-[90px]" />
            <div className="bg-landing-surface-600 size-[90px]" />
          </div>
        </div>
        {/* Architecture diagram placeholder */}
        <SystemDiagram className="flex-1" />
      </div>
    </div>
  );
};

export default SecondHalf;
