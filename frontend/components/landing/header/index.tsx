"use client";

import Image from "next/image";
import Link from "next/link";
import GitHubButton from "react-github-btn";

import logo from "@/assets/logo/logo.svg";
import { cn } from "@/lib/utils";

import { navLink } from "../class-names";
import LandingButton from "../landing-button";

interface LandingHeaderProps {
  hasSession: boolean;
  className?: string;
  isIncludePadding?: boolean;
}

export default function LandingHeader({ hasSession, className, isIncludePadding = false }: LandingHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between w-full relative z-50",
        { "md:pt-8 md:px-[48px] pt-4 px-4": isIncludePadding },
        className
      )}
    >
      <div className={cn(
        "relative shrink-0 md:w-[120px] md:h-[21px]",
        "w-[90px] h-[16px]"
      )}>
        <Link href="/" className="block">
          <Image alt="Laminar logo" src={logo} fill className="object-contain" priority />
        </Link>
      </div>
      <div className={cn(
        "flex md:gap-[60px] items-center justify-center",
        "gap-4"
      )}>
        <nav className={cn(
          "hidden md:flex md:gap-[40px] items-center",
          navLink
        )}>
          <Link
            href="https://docs.laminar.sh"
            target="_blank"
            className="no-underline text-landing-text-300 hover:text-landing-text-200"
          >
            DOCS
          </Link>
          <Link href="/blog" className="no-underline text-landing-text-300 hover:text-landing-text-200">
            BLOG
          </Link>
          <Link href="/pricing" className="no-underline text-landing-text-300 hover:text-landing-text-200">
            PRICING
          </Link>
          <Link
            target="_blank"
            href="https://discord.gg/nNFUUDAKub"
            className="no-underline text-landing-text-300 hover:text-landing-text-200"
          >
            DISCORD
          </Link>
          <div className="hidden lg:block">
            <GitHubButton
              href="https://github.com/lmnr-ai/lmnr"
              data-color-scheme="no-preference: dark; light: dark; dark: dark;"
              data-size="large"
              data-show-count="true"
              aria-label="Star lmnr-ai/lmnr on GitHub"
            >
              Star
            </GitHubButton>
          </div>
        </nav>
        <div className={cn(
          "flex md:gap-3 items-center",
          "gap-2"
        )}>
          {hasSession ? (
            <Link href="/projects">
              <LandingButton variant="outline">DASHBOARD</LandingButton>
            </Link>
          ) : (
            <>
              <Link href="/sign-in">
                <LandingButton variant="minimal">SIGN IN</LandingButton>
              </Link>
              <Link href="/sign-up">
                <LandingButton variant="outline">SIGN UP</LandingButton>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
