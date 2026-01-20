"use client";

import { Equal, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import logo from "@/assets/logo/logo.svg";
import { cn } from "@/lib/utils";

import { navLink } from "../class-names";
import LandingButton from "../landing-button";
import GitHubStarsButton from "./github-stars-button";

interface LandingHeaderProps {
  hasSession: boolean;
  className?: string;
  isIncludePadding?: boolean;
}

const NAV_LINKS = [
  { href: "https://docs.laminar.sh", label: "Docs", external: true },
  { href: "/blog", label: "Blog", external: false },
  { href: "/pricing", label: "Pricing", external: false },
  { href: "https://discord.gg/nNFUUDAKub", label: "Discord", external: true },
  { href: "https://github.com/lmnr-ai/lmnr", label: "GitHub", external: true },
];

export default function LandingHeader({ hasSession, className, isIncludePadding = false }: LandingHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header
        className={cn(
          "flex items-center justify-between w-full relative z-50",
          { "md:pt-y md:pr-[48px] md:pl-[48px] py-4 pl-[32px] pr-[20px]": isIncludePadding },
          className
        )}
      >
        <div className={cn("relative shrink-0 md:w-[120px] md:h-[21px]", "w-[90px] h-[16px]")}>
          <Link href="/" className="block">
            <Image alt="Laminar logo" src={logo} fill className="object-contain" priority />
          </Link>
        </div>
        <div className={cn("flex md:gap-[40px] items-center justify-center", "gap-4")}>
          <nav className={cn("hidden md:flex md:gap-[32px] items-center", navLink)}>
            <Link
              href="https://docs.laminar.sh"
              target="_blank"
              className="no-underline text-landing-text-300 hover:text-landing-text-200"
            >
              Docs
            </Link>
            <Link href="/blog" className="no-underline text-landing-text-300 hover:text-landing-text-200">
              Blog
            </Link>
            <Link href="/pricing" className="no-underline text-landing-text-300 hover:text-landing-text-200">
              Pricing
            </Link>
            <Link
              target="_blank"
              href="https://discord.gg/nNFUUDAKub"
              className="no-underline text-landing-text-300 hover:text-landing-text-200"
            >
              Discord
            </Link>
            <GitHubStarsButton owner="lmnr-ai" repo="lmnr" className="hidden lg:flex" />
          </nav>
          <div className={cn("flex md:gap-3 items-center", "gap-2")}>
            {hasSession ? (
              <Link href="/projects">
                <LandingButton variant="outline" size="sm">
                  Dashboard
                </LandingButton>
              </Link>
            ) : (
              <>
                <Link href="/sign-in">
                  <LandingButton variant="minimal" size="sm">
                    Sign in
                  </LandingButton>
                </Link>
                <Link href="/sign-up">
                  <LandingButton variant="outline" size="sm">
                    Sign up
                  </LandingButton>
                </Link>
              </>
            )}
            <button
              type="button"
              className="md:hidden p-1 text-landing-text-300"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? <X className="size-5" /> : <Equal className="size-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay - starts below header */}
      <div
        className={cn(
          "fixed left-0 right-0 bottom-0 top-[64px] z-40 bg-landing-surface-900 md:hidden transition-opacity duration-300",
          mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      >
        <nav className="flex flex-col px-[32px] pt-12 border-t border-t-landing-surface-400 gap-5">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              className="font-space-grotesk text-[28px] leading-[30px] text-white no-underline hover:text-landing-text-200 tracking-tight"
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
