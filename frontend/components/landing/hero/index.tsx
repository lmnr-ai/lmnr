import Link from "next/link";

import { cn } from "@/lib/utils";

import { bodyMedium, mainTitle } from "../class-names";
import Header from "../header";
import LogoStrip from "./logo-strip";
import YCBadge from "./yc-badge";

interface Props {
  className?: string;
  hasSession: boolean;
}

// Hero per Figma `Frame 1131` (4054:8186): centered YC badge + mainTitle +
// bodyMedium, then a CTA row (Get Started + Docs), then the customer logo
// strip below.
const Hero = ({ className, hasSession }: Props) => (
  <div className={cn("flex flex-col w-full items-center bg-landing-surface-800", className)}>
    <Header hasSession={hasSession} className="w-full max-w-[1452px] pt-4" isIncludePadding />

    <div className="flex flex-col items-center w-full px-6 h-[60vh] justify-end  pb-2">
      <div className="flex flex-col items-center gap-8 max-w-[640px] justify-end pb-[80px] flex-1">
        <div className="flex flex-col items-center gap-4">
          <YCBadge />
          <h1 className={mainTitle}>{"Open-source\nAgent Monitoring"}</h1>
          <p className={bodyMedium}>{"Get alerts when your agent breaks.\nUnderstand why in seconds."}</p>
        </div>

        <div className="flex flex-row gap-5 items-center">
          <Link
            href="/sign-up"
            className="flex items-center justify-center w-[120px] h-[33px] rounded-sm bg-landing-primary-400 hover:bg-landing-primary-300 transition-colors no-underline"
          >
            <span className="font-sans text-sm text-white">Get Started</span>
          </Link>
          <Link
            href="https://laminar.sh/docs"
            target="_blank"
            className="flex items-center justify-center w-[120px] h-[33px] rounded-sm hover:bg-landing-surface-700 transition-colors no-underline border"
          >
            <span className="font-sans text-sm text-landing-text-300">Docs</span>
          </Link>
        </div>
      </div>

      <LogoStrip />
    </div>
  </div>
);

export default Hero;
