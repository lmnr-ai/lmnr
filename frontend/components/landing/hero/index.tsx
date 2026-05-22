import Link from "next/link";

import { cn } from "@/lib/utils";

import { bodyMedium, mainTitle } from "../class-names";
import Header from "../header";
import DiamondGrid from "./diamond-grid";
import ExtendedDiamondsOverlay, { EXTENDED_CELL_KEYS } from "./extended-diamonds";
import GridFadeWrapper from "./grid-fade-wrapper";
import LogoStrip from "./logo-strip";

interface Props {
  className?: string;
  hasSession: boolean;
}

// Hero per Figma `Frame 1138` (4071:11243). Header + hero content + logo strip
// all live inside the same 880px centered column. Title block is left-aligned;
// CTA row sits below at gap-32. Logo strip is a 4-col grid below.
const Hero = ({ className, hasSession }: Props) => (
  <div className={cn("flex flex-col items-center w-full", className)}>
    <Header hasSession={hasSession} className="w-full max-w-[880px] pt-4 px-6 md:px-0" isIncludePadding />

    <div className="flex flex-col items-center w-full px-6 md:px-0 pt-[140px] pb-2 justify-start gap-[60px] shrink-0">
      <div className="flex flex-col items-start gap-8 w-full max-w-[880px]">
        <div className="flex flex-col items-start gap-4">
          <h1 className={mainTitle}>Open-source Agent Monitoring</h1>
          <p className={bodyMedium}>
            {
              "Laminar analyzes every trace your agent produces, surfaces the behavior worth your attention,\nand turns recurring failures into regression evals. Automatically."
            }
          </p>
        </div>

        <div className="flex flex-row gap-3 items-center">
          <Link
            href="/sign-up"
            className="flex items-center justify-center w-[160px] h-[36px] rounded-sm bg-landing-primary-400 hover:bg-landing-primary-300 transition-colors no-underline"
          >
            <span className="font-sans text-sm text-white">Get Started</span>
          </Link>
          <Link
            href="https://laminar.sh/docs"
            target="_blank"
            className="flex items-center justify-center w-[160px] h-[36px] rounded-sm hover:bg-landing-surface-700 transition-colors no-underline border"
          >
            <span className="font-sans text-sm text-landing-text-300">Docs</span>
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {/* Hero visual (Figma 4173:30043). Layered z-index plan, leaving
            gaps so future scan lines + orange cluster can slot in cleanly:
              z-0  radial highlight  (behind grid — subtle lift in field)
              z-10 diamond grid
              z-20 scan lines        (TODO)
              z-30 orange cluster    (TODO)
              z-40 left-edge fade    (masks grid into page bg on the left)
              z-50 top-edge fade     (soft top vignette across full width) */}
        <div className="relative w-[880px] h-[300px] rounded-sm overflow-hidden">
          <GridFadeWrapper className="absolute inset-0">
            <div
              aria-hidden
              className="absolute left-0 bottom-[-400px] size-[600px] opacity-40 pointer-events-none z-0"
              style={{
                background: "radial-gradient(circle, var(--color-landing-surface-400) 0%, transparent 60%)",
              }}
            />
            <DiamondGrid
              className="absolute left-[-274px] top-1/2 -translate-y-1/2 w-[668px] h-[1157px] z-10"
              emptyCells={EXTENDED_CELL_KEYS}
            />
            <ExtendedDiamondsOverlay />
          </GridFadeWrapper>
          <div
            aria-hidden
            className="absolute left-0 top-0 bottom-0 w-[328px] opacity-80 pointer-events-none z-40 bg-gradient-to-r from-landing-surface-700 to-transparent"
          />
          <div
            aria-hidden
            className="absolute left-0 top-0 w-full size-[300px] opacity-40 pointer-events-none z-50 bg-gradient-to-b from-landing-surface-700 to-transparent"
          />
        </div>
        <LogoStrip className="max-w-[880px]" />
      </div>
    </div>
  </div>
);

export default Hero;
