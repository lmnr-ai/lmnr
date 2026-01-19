"use client";

import { useScroll } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";

import { cn } from "@/lib/utils";

import { bodySQL, sectionHeaderLarge } from "../class-names";
import DocsButton from "../docs-button";
import LocalToScaleImage from "./local-to-scale-image";

interface Props {
  className?: string;
}

const SecondHalfDesktop = ({ className }: Props) => {
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
        <div className="flex flex-col gap-[240px] w-[500px] pb-[0px] pt-[20px]">
          {/* Try it local, free section */}
          <div className="flex flex-col gap-6 items-start">
            <h2 className={sectionHeaderLarge}>Try it local, free</h2>
            <div className="flex flex-col items-start w-[380px]">
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Set up with Docker in three lines</p>
              </div>
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Open source</p>
              </div>
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Self-host anywhere</p>
              </div>
            </div>
            <DocsButton href="https://docs.laminar.sh/hosting-options" />
          </div>

          {/* Production-grade section */}
          <div className="flex flex-col gap-[37px] items-start">
            <h2 className={sectionHeaderLarge}>
              Production-grade
              <br />
              to the core
            </h2>
            <div className="flex flex-col items-start w-[380px]">
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Optimized for performance in Rust</p>
              </div>
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Terabytes of data with ease</p>
              </div>
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>
                  HIPAA compliant, SOC2 Type 2 in progress
                </p>
              </div>
            </div>
            <div className="flex gap-5 items-start translate-x-[-8px]">
              <Image src="/assets/landing/hipaa.svg" alt="HIPAA compliant" width={90} height={90} />
              <Image src="/assets/landing/soc2.svg" alt="SOC2 compliant" width={90} height={90} />
            </div>
            <DocsButton label="Compliance" href="https://compliance.laminar.sh/" />
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
    </div>
  );
};

export default SecondHalfDesktop;
