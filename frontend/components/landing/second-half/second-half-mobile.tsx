"use client";

import { useScroll } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";

import { cn } from "@/lib/utils";

import { bodySQL, sectionHeaderLarge } from "../class-names";
import DocsButton from "../docs-button";

interface Props {
  className?: string;
}

const SecondHalfMobile = ({ className }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  return (
    <div
      className={cn(
        "bg-landing-surface-800 flex flex-col gap-16 items-center justify-center py-20 px-4 w-full",
        className
      )}
    >
      <div ref={containerRef} className="flex flex-col gap-16 w-full max-w-full">
        {/* Section 1: Try it local, free */}
        <div className="flex flex-col gap-6 items-start w-full">
          <h2 className={sectionHeaderLarge}>Try it local, free</h2>
          <div className="flex flex-col items-start w-full">
            <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-4 w-full">
              <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Set up with Docker in three lines</p>
            </div>
            <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-4 w-full">
              <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Open source</p>
            </div>
            <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-4 w-full">
              <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Self-host anywhere</p>
            </div>
          </div>
          <DocsButton href="https://docs.laminar.sh/hosting-options" />
        </div>

        {/*

        <div className="h-[350px] w-full relative overflow-hidden">
          <LocalToScaleImage
            className="absolute top-0 left-1/2 -translate-x-1/2"
            scrollYProgress={scrollYProgress}
          />
        </div>

        */}

        {/* Section 2: Ready to scale */}
        <div className="flex flex-col gap-6 items-start w-full">
          <h2 className={sectionHeaderLarge}>
            Ready to scale?
            <br />
            We got you.
          </h2>
          <div className="flex flex-col items-start w-full">
            <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-4 w-full">
              <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Affordable hosted solution</p>
            </div>
            <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-4 w-full">
              <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Workspace members and roles</p>
            </div>
            <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-4 w-full">
              <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Terabytes of data with ease</p>
            </div>
          </div>
          <DocsButton href="/pricing" label="PRICING" />
        </div>

        {/* Section 3: Production-grade */}
        <div className="flex flex-col gap-6 items-start w-full">
          <h2 className={sectionHeaderLarge}>
            Production-grade
            <br />
            to the core
          </h2>
          <p className="font-sans font-normal leading-6 text-sm text-landing-text-200 w-full">
            Built in Rust and mega-optimized for performance. Terabytes of trace data in production without slowing
            down.
            <br />
            <br />
            SOC2 and HIPAA compliant.
          </p>
          <div className="flex gap-4 items-start">
            <Image src="/assets/landing/soc2.svg" alt="SOC2 compliant" width={70} height={70} />
            <Image src="/assets/landing/hipaa.svg" alt="HIPAA compliant" width={70} height={70} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecondHalfMobile;
