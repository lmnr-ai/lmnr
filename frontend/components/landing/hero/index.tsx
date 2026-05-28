import Link from "next/link";

import { cn } from "@/lib/utils";

import { LANDING_COLUMN_MAX_W, mainTitle } from "../class-names";
import CubesIllustration from "./cubes-illustration";
import HeroHeader from "./hero-header";
import LogoStrip from "./logo-strip";

interface Props {
  className?: string;
  hasSession: boolean;
}

// Hero per figma 4272:9250. Two-column row inside the 880px center column:
// LEFT carries the hero-header (column-wide, not viewport-wide), title + body
// + CTAs; RIGHT carries the 281×778 rising-cubes illustration. The 5-logo
// strip lives below the row and spans the full column width.
const Hero = ({ className, hasSession: _hasSession }: Props) => (
  <div className={cn("flex flex-col items-center w-full pb-2", className)}>
    <div className={cn("flex flex-col items-center w-full px-6 lg:px-0 gap-[80px]", LANDING_COLUMN_MAX_W)}>
      <div className="flex flex-row gap-[100px] w-full items-start">
        {/* LEFT — figma Frame 1328, 499px wide × 778px tall. Header sits at
            top; title/body/CTAs at ~205px from top to match figma. */}
        <div className="flex flex-col w-full md:flex-1 md:min-w-0 md:h-[778px] pt-4">
          <HeroHeader />

          <div className="mt-[205px] flex flex-col items-start gap-8">
            <div className="flex flex-col items-start gap-4">
              <h1 className={cn(mainTitle)}>
                Open-source
                <br />
                Agent Monitoring
              </h1>
              <p className="font-sans-landing text-base leading-6 text-landing-text-200">
                Laminar analyzes every trace your agent produces,
                <br className="hidden md:block" /> surfaces the behavior worth your attention,
                <br className="hidden md:block" /> and turns recurring failures into regression evals. Automatically.
              </p>
            </div>

            <div className="flex flex-row gap-3 items-center">
              <Link
                href="/sign-up"
                className="flex items-center justify-center w-[124px] h-[33px] rounded-sm bg-landing-primary-400 hover:bg-landing-primary-300 transition-colors no-underline"
              >
                <span className="font-sans-landing text-sm text-white">Get Started</span>
              </Link>
              <Link
                href="https://laminar.sh/docs"
                target="_blank"
                className="flex items-center justify-center w-[82px] h-[33px] rounded-sm border border-landing-text-600 hover:bg-landing-surface-600 transition-colors no-underline"
              >
                <span className="font-sans-landing text-sm text-landing-text-300">Docs</span>
              </Link>
            </div>
          </div>
        </div>

        {/* RIGHT — figma Frame 1329, 281×778. Hidden on mobile. */}
        <div className="hidden md:block w-[281px] h-[778px] shrink-0">
          <CubesIllustration />
        </div>
      </div>

      <LogoStrip />
    </div>
  </div>
);

export default Hero;
