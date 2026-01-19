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

const SecondHalf = ({ className }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "end center"],
  });

  return (
    <div
      className={cn(
        "bg-landing-surface-800 flex flex-col items-center justify-center w-full md:px-8",
        "py-20 px-3 gap-16",
        "md:py-[280px] md:gap-[240px]",
        className
      )}
    >
      <div
        ref={containerRef}
        className={cn(
          "flex w-full max-w-full",
          "flex-col gap-16",
          "md:flex-row md:justify-between md:w-[1164px] md:relative"
        )}
      >
        {/* Left column - text content */}
        <div
          className={cn(
            "flex flex-col items-start",
            "gap-16 w-full",
            "md:gap-[240px] md:w-[500px] md:pb-0 md:pt-[20px]"
          )}
        >
          {/* Try it local, free section */}
          <div className="flex flex-col gap-6 items-start w-full">
            <h2 className={sectionHeaderLarge}>Try it local, free</h2>
            <div className={cn("flex flex-col items-start w-full", "md:w-[380px]")}>
              <div
                className={cn(
                  "border-t border-landing-surface-400 flex items-center justify-center px-0 w-full",
                  "py-4",
                  "md:py-[18px]"
                )}
              >
                <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Set up with Docker in three lines</p>
              </div>
              <div
                className={cn(
                  "border-t border-landing-surface-400 flex items-center justify-center px-0 w-full",
                  "py-4",
                  "md:py-[18px]"
                )}
              >
                <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Open source</p>
              </div>
              <div
                className={cn(
                  "border-t border-landing-surface-400 flex items-center justify-center px-0 w-full",
                  "py-4",
                  "md:py-[18px]"
                )}
              >
                <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Self-host anywhere</p>
              </div>
            </div>
            <DocsButton href="https://docs.laminar.sh/hosting-options" />
          </div>

          {/* Production-grade section */}
          <div className={cn("flex flex-col items-start w-full", "gap-6", "md:gap-[37px]")}>
            <h2 className={sectionHeaderLarge}>
              Production-grade
              <br />
              to the core
            </h2>
            <div className={cn("flex flex-col items-start w-full", "md:w-[380px]")}>
              <div
                className={cn(
                  "border-t border-landing-surface-400 flex items-center justify-center px-0 w-full",
                  "py-4",
                  "md:py-[18px]"
                )}
              >
                <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Optimized for performance in Rust</p>
              </div>
              <div
                className={cn(
                  "border-t border-landing-surface-400 flex items-center justify-center px-0 w-full",
                  "py-4",
                  "md:py-[18px]"
                )}
              >
                <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Terabytes of data with ease</p>
              </div>
              <div
                className={cn(
                  "border-t border-landing-surface-400 flex items-center justify-center px-0 w-full",
                  "py-4",
                  "md:py-[18px]"
                )}
              >
                <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>
                  HIPAA compliant, SOC2 Type 2 in progress
                </p>
              </div>
            </div>
            <div className={cn("flex items-start", "gap-4 translate-x-[-4px]", "md:gap-5 md:translate-x-[-8px]")}>
              <Image
                src="/assets/landing/hipaa.svg"
                alt="HIPAA compliant"
                width={90}
                height={90}
                className={cn("w-[70px] h-[70px]", "md:w-[90px] md:h-[90px]")}
              />
              <Image
                src="/assets/landing/soc2.svg"
                alt="SOC2 compliant"
                width={90}
                height={90}
                className={cn("w-[70px] h-[70px]", "md:w-[90px] md:h-[90px]")}
              />
            </div>
            <DocsButton label="Compliance" href="https://compliance.laminar.sh/" />
          </div>
        </div>

        {/* Right column - sticky image (hidden on mobile) */}
        <div className="hidden md:block relative max-w-full">
          <div className="sticky top-[calc(50vh-200px)] h-[400px] max-w-full">
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

export default SecondHalf;
