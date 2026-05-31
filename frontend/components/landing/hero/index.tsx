import Link from "next/link";

import { cn } from "@/lib/utils";

import { LANDING_COLUMN_MAX_W, mainTitle } from "../class-names";
import Header from "../header";
import LogoStrip from "./logo-strip";

interface Props {
  className?: string;
  hasSession: boolean;
}

// Hero per Figma `Frame 1138` (4071:11243). Header + hero content + logo strip
// all live inside the same 880px centered column. Title block is left-aligned;
// CTA row sits below at gap-32. Logo strip is a 4-col grid below.
const Hero = ({ className, hasSession }: Props) => (
  <div className={cn("flex flex-col items-center w-full z-10", className)}>
    <Header hasSession={hasSession} className={cn("w-full pt-4 px-6 lg:px-0", LANDING_COLUMN_MAX_W)} isIncludePadding />

    <div className="flex flex-col items-center w-full px-6 lg:px-0 pt-[100px] pb-2 justify-start gap-[80px] shrink-0">
      <div className={cn("flex flex-col items-start gap-8 w-full", LANDING_COLUMN_MAX_W)}>
        <div className="flex flex-col items-start gap-4">
          <h1 className={cn(mainTitle, "tracking-[-0.015em]")}>
            Ship reliable agents{` `}
            <br className="block sm:hidden" />
          </h1>
          <p className={cn("font-sans-landing text-[20px] text-landing-text-200")}>
            Laminar catches every agent failure, surfaces what to fix, and confirms the fix resolved it.
          </p>
        </div>

        <div className="flex flex-row gap-3 items-center">
          <Link
            href="/sign-up"
            className="flex items-center justify-center w-[160px] h-[36px] rounded-sm bg-landing-primary-200 hover:bg-landing-primary-400 transition-colors no-underline"
          >
            <span className="font-sans-landing font-medium text-sm text-black">Get started – free</span>
          </Link>
          <Link
            href="https://laminar.sh/docs"
            target="_blank"
            className="flex items-center justify-center w-[160px] h-[36px] rounded-sm border border-landing-text-600 hover:bg-landing-surface-600 transition-colors no-underline"
          >
            <span className="font-sans-landing font-medium text-sm text-landing-text-200">Docs</span>
          </Link>
        </div>
      </div>

      <LogoStrip className={LANDING_COLUMN_MAX_W} />
    </div>
  </div>
);

export default Hero;
