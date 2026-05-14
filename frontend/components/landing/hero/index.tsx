import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

import Header from "../header";
import LandingButton from "../landing-button";
import CustomerLogoStrip from "./customer-logo-strip";
import TimelineMock from "./timeline-mock";

interface Props {
  className?: string;
  hasSession: boolean;
}

const Hero = ({ className, hasSession }: Props) => (
  <div className={cn("bg-landing-surface-800 flex flex-col w-full h-[calc(100dvh+20px)] items-center", className)}>
    <Header hasSession={hasSession} className="max-w-[1104px] pt-4" />
    <div className={cn("flex flex-1 flex-col gap-12 w-full pt-8", "md:pt-30 md:gap-8 md:max-w-[1104px]")}>
      <div className={cn("flex flex-col gap-4", "md:gap-6")}>
        <div className="flex flex-col items-start gap-3 max-w-[640px]">
          <Link
            href="https://www.ycombinator.com/companies/laminar"
            target="_blank"
            className="flex items-center gap-2 no-underline"
          >
            <Image src="/assets/landing/y-combinator.svg" alt="Y Combinator" width={16} height={16} />
            <span className="font-sans text-xs text-landing-text-300 tracking-[0.02em]">Backed by Y-Combinator</span>
          </Link>
          <h1
            className={cn(
              "font-space-grotesk font-normal text-white tracking-[-0.7px]",
              "md:text-[32px] md:leading-[41px] text-[28px] leading-9"
            )}
          >
            Open-source Agent Monitoring
          </h1>
          <p className={cn("font-sans text-lg leading-5 text-landing-text-300", "md:text-lg md:leading-7")}>
            Get alerts when your agent breaks,
            <br />
            Understand why in seconds.
          </p>
        </div>

        <div className="flex flex-row gap-5 items-center mt-2">
          <Link href="/sign-up">
            <LandingButton variant="primary" size="sm" className="w-[160px]">
              Get Started
            </LandingButton>
          </Link>
          <Link href="https://laminar.sh/docs" target="_blank">
            <LandingButton variant="outline" size="sm" className="w-[160px]">
              Read the Docs
            </LandingButton>
          </Link>
        </div>
      </div>

      <div className="hidden md:block w-full flex-1">
        <TimelineMock className="h-full" />
      </div>

      <CustomerLogoStrip className="" />
    </div>
  </div>
);

export default Hero;
