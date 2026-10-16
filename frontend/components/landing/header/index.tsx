"use client";

import { Equal, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import logo from "@/assets/logo/laminar-wordmark.svg";
import { cn } from "@/lib/utils";

import LandingButton from "../landing-button";
import GitHubStarsButton from "./github-stars-button";

interface LandingHeaderProps {
  hasSession: boolean;
  className?: string;
  isIncludePadding?: boolean;
  // Keeps Docs and Pricing in the bar below md; the auth buttons move into the menu to make room.
  isShowMobileNav?: boolean;
}

const NAV_LINKS = [
  { href: "https://laminar.sh/docs", label: "Docs", external: true },
  { href: "/blog", label: "Blog", external: false },
  { href: "/pricing", label: "Pricing", external: false },
  { href: "https://cal.com/robert-lmnr/demo", label: "Book a demo", external: true },
  { href: "https://github.com/lmnr-ai/lmnr", label: "GitHub", external: true },
];
// Shown inline in the bar under isShowMobileNav, so left out of the menu there.
const MOBILE_BAR_LABELS = new Set(["Docs", "Pricing"]);
const AUTH_LINKS = [
  { href: "/sign-in", label: "Sign in", external: false },
  { href: "/sign-up", label: "Sign up", external: false },
];
const DASHBOARD_LINK = { href: "/projects", label: "Dashboard", external: false };

export default function LandingHeader({
  hasSession,
  className,
  isIncludePadding = false,
  isShowMobileNav = false,
}: LandingHeaderProps) {
  const mobileHidden = cn({ "hidden md:inline": isShowMobileNav });
  const mobileMenuLinks = isShowMobileNav
    ? [
        ...NAV_LINKS.filter((link) => !MOBILE_BAR_LABELS.has(link.label)),
        ...(hasSession ? [DASHBOARD_LINK] : AUTH_LINKS),
      ]
    : NAV_LINKS;

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Lock body scroll while the mobile menu is open. The overlay is fixed with
  // pointer-events-auto, but wheel/touch events still bubble to <body> — without
  // overflow:hidden you can scroll the page underneath.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <header
        className={cn(
          "flex items-center justify-between w-full relative z-50",
          { "md:pr-[48px] md:pl-[48px] py-4 pl-[32px] pr-[20px]": isIncludePadding },
          className
        )}
      >
        <Link href="/" className="block shrink-0">
          {/* Width-only CSS + h-auto preserves the SVG's native 100:18 aspect
              ratio, which already matches the previous 100x18 / 80x14 wrapper
              dimensions — no visual change. Setting one dimension and leaving
              the other auto silences the Next.js "modified, but not the other"
              warning that fill-mode + sized wrapper was triggering. */}
          <Image alt="Laminar logo" src={logo} className="w-[100px] h-auto md:-translate-y-0.5" priority />
        </Link>
        <div className={cn("flex md:gap-[40px] items-center justify-center", isShowMobileNav ? "gap-3" : "gap-4")}>
          <nav
            className={cn(
              "md:flex md:gap-[32px] items-center font-sans-landing md:text-sm leading-normal whitespace-nowrap",
              isShowMobileNav ? "flex gap-4 text-sm" : "hidden text-xs"
            )}
          >
            <Link href="https://laminar.sh/docs" target="_blank" className="no-underline hover:text-foreground-200">
              Docs
            </Link>
            <Link href="/blog" className={cn("no-underline hover:text-foreground-200", mobileHidden)}>
              Blog
            </Link>
            <Link href="/pricing" className="no-underline hover:text-foreground-200">
              Pricing
            </Link>
            <Link
              target="_blank"
              href="https://cal.com/robert-lmnr/demo"
              className={cn("no-underline hover:text-foreground-200", mobileHidden)}
            >
              Book demo
            </Link>
            <GitHubStarsButton owner="lmnr-ai" repo="lmnr" className="hidden lg:flex" />
          </nav>
          <div className={cn("flex md:gap-3 items-center", "gap-2")}>
            {hasSession ? (
              <Link href="/projects" className={mobileHidden}>
                <LandingButton variant="outline" size="xs" className="py-2 sm:py-1 px-4 sm:px-3">
                  Dashboard
                </LandingButton>
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className={mobileHidden}>
                  <LandingButton variant="minimal" size="xs" className="py-2 sm:py-1.5">
                    Sign in
                  </LandingButton>
                </Link>
                <Link href="/sign-up" className={mobileHidden}>
                  <LandingButton variant="outline" size="xs" className="py-2 sm:py-1 px-4 sm:px-3">
                    Sign up
                  </LandingButton>
                </Link>
              </>
            )}
            <button
              type="button"
              className="md:hidden p-1 text-foreground-300"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? <X className="size-5" /> : <Equal className="size-5" />}
            </button>
          </div>
        </div>
      </header>
      {/* Mobile Menu Overlay - starts below the announcement banner and header */}
      <div
        className={cn(
          "fixed left-0 right-0 bottom-0 top-[100px] z-40 bg-surface-150 md:hidden transition-opacity duration-300",
          mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      >
        <nav className="flex flex-col px-[32px] pt-12 border-t border-t-surface-400 gap-5">
          {mobileMenuLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              className="font-sans-landing font-medium text-[28px] leading-[30px] text-white no-underline hover:text-foreground-200 tracking-tight"
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
