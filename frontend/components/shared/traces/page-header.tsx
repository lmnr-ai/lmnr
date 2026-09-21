"use client";

import Image from "next/image";
import Link from "next/link";

import logo from "@/assets/logo/laminar-wordmark.svg";
import GitHubStarsButton from "@/components/landing/header/github-stars-button";
import LandingButton from "@/components/landing/landing-button";
import { cn } from "@/lib/utils";

interface SharedPageHeaderProps {
  hasSession: boolean;
  className?: string;
}

const NAV_LINKS = [
  { href: "https://laminar.sh/docs", label: "Docs", external: true },
  { href: "/blog", label: "Blog", external: false },
  { href: "/pricing", label: "Pricing", external: false },
];

// Marketing-style chrome for the public shared-trace page: same wordmark, nav
// typography and button set as the landing header, trimmed for a full-height
// app layout (no mobile overlay menu — the trace view below owns the viewport).
export default function SharedPageHeader({ hasSession, className }: SharedPageHeaderProps) {
  return (
    <header
      className={cn(
        "flex h-12 flex-none items-center justify-between gap-4 border-b bg-surface-50 px-2 sm:px-4",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/" className="block shrink-0">
          <Image alt="Laminar logo" src={logo} className="w-[100px] h-auto md:-translate-y-0.5" priority />
        </Link>
        <span className="hidden sm:flex items-center gap-2 font-sans-landing text-sm leading-normal whitespace-nowrap text-foreground-300">
          <span className="text-foreground-500">/</span>
          Shared trace
        </span>
      </div>
      <div className="flex items-center gap-4 md:gap-[40px]">
        <nav className="hidden md:flex items-center gap-[32px] font-sans-landing text-sm leading-normal whitespace-nowrap text-foreground-200">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              className="no-underline hover:text-foreground-50"
            >
              {link.label}
            </Link>
          ))}
          <GitHubStarsButton owner="lmnr-ai" repo="lmnr" className="hidden lg:flex" />
        </nav>
        <div className="flex items-center gap-2 md:gap-3">
          {hasSession ? (
            <Link href="/projects">
              <LandingButton variant="outline" size="xs">
                Dashboard
              </LandingButton>
            </Link>
          ) : (
            <>
              <Link href="/sign-in">
                <LandingButton variant="minimal" size="xs" className="py-2 sm:py-1.5">
                  Sign in
                </LandingButton>
              </Link>
              <Link href="/sign-up">
                <LandingButton variant="outline" size="xs" className="py-2 sm:py-1 px-4 sm:px-3">
                  Sign up
                </LandingButton>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
