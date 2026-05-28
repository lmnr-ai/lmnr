import Link from "next/link";

import { cn } from "@/lib/utils";

import { LANDING_COLUMN_MAX_W } from "../class-names";
import CubesIllustration from "./cubes-illustration";
import HeroHeader from "./hero-header";
import LogoStrip from "./logo-strip";

interface Props {
  className?: string;
  // Kept for parity with the old Hero — currently unused since this header
  // has no auth CTAs.
  hasSession: boolean;
}

// Rising-cubes hero (figma 4200:55201). Layout follows the figma's 880×778
// frame exactly: LEFT column 499px (header + hero text + CTAs + logo strip)
// with a 100px gap before the 281px RIGHT illustration column. Internal
// vertical gaps inside the LEFT column are 207px between major sections,
// matching the figma's 778px total.

const TITLE = "Open-source\nAgent Monitoring";
const BODY =
  "Laminar analyzes every trace your agent produces,\nsurfaces the behavior worth your attention,\nand turns recurring failures into regression evals.\nAutomatically.";

const Hero = ({ className, hasSession: _hasSession }: Props) => (
  <div className={cn("flex flex-col items-center w-full pb-20", className)}>
    <div className={cn("flex flex-row gap-[100px] w-full px-6 lg:px-0 items-start", LANDING_COLUMN_MAX_W)}>
      {/* LEFT column — figma Frame 1328, 499px wide × 778px tall. mt-auto on
          the logo strip pushes it to the bottom so the LEFT bottom aligns
          with the RIGHT illustration bottom. */}
      <div className="flex flex-col w-full md:flex-1 md:min-w-0 md:h-[778px] pt-5">
        <HeroHeader />

        <div className="mt-[207px] flex flex-col items-start">
          <h1 className="font-manrope font-medium text-white whitespace-pre-line tracking-[-0.02em] md:text-[32px] md:leading-9 text-[28px] leading-tight">
            {TITLE}
          </h1>
          <p className="mt-6 text-base leading-6 text-white/80 whitespace-pre-line">{BODY}</p>

          <div className="mt-9 flex flex-row gap-3 items-center">
            <Link
              href="/sign-up"
              className="flex items-center justify-center w-[124px] h-[33px] rounded-sm bg-landing-primary-400 hover:bg-landing-primary-300 transition-colors no-underline"
            >
              <span className="font-sans text-sm text-white">Get Started</span>
            </Link>
            <Link
              href="https://laminar.sh/docs"
              target="_blank"
              className="flex items-center justify-center w-[82px] h-[33px] rounded-sm hover:bg-landing-surface-700 transition-colors no-underline border"
            >
              <span className="font-sans text-sm text-landing-text-300">Docs</span>
            </Link>
          </div>
        </div>

        <LogoStrip className="mt-auto" />
      </div>

      {/* RIGHT column — figma Frame 1329, 281px wide × 778px tall. */}
      <div className="hidden md:block w-[281px] h-[778px] shrink-0">
        <CubesIllustration />
      </div>
    </div>
  </div>
);

export default Hero;
