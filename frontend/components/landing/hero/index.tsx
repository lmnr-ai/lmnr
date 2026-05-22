import Link from "next/link";

import { cn } from "@/lib/utils";

import { bodyMedium, mainTitle } from "../class-names";
import Header from "../header";
import { LANDING_COLUMN_MAX_W } from "../layout";
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
    <Header hasSession={hasSession} className={cn("w-full pt-4 px-6 md:px-0", LANDING_COLUMN_MAX_W)} isIncludePadding />

    <div className="flex flex-col items-center w-full px-6 md:px-0 pt-[140px] pb-2 h-[80vh] justify-start gap-[10vh] shrink-0">
      <div className={cn("flex flex-col items-start gap-8 w-full", LANDING_COLUMN_MAX_W)}>
        <div className="flex flex-col items-start gap-4">
          <h1 className={mainTitle}>Open-source Agent Monitoring</h1>
          <p className={bodyMedium}>
            Laminar analyzes every trace your agent produces, surfaces the behavior worth your attention,
            <br className="hidden md:block" /> and turns recurring failures into regression evals. Automatically.
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

      <LogoStrip className={LANDING_COLUMN_MAX_W} />
    </div>
  </div>
);

export default Hero;
