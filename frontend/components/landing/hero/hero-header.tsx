"use client";

import { Equal, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import logo from "@/assets/logo/laminar-wordmark.svg";
import { cn } from "@/lib/utils";

// Hero-only header. Differs from the shared LandingHeader: full-width
// announcement banner above; logo + nav items live in a single row that
// flows left-to-right (no auth CTAs pushed to the right) so the row only
// fills the LEFT column of the hero, leaving room for the illustration
// on the right.
const NAV_LINKS = [
  { href: "/blog", label: "Blog", external: false },
  { href: "/pricing", label: "Pricing", external: false },
  { href: "https://discord.gg/nNFUUDAKub", label: "Discord", external: true },
  { href: "https://cal.com/robert-lmnr/30min", label: "Book a demo", external: true },
  { href: "https://github.com/lmnr-ai/lmnr", label: "GitHub", external: true },
];

interface Props {
  className?: string;
}

export default function HeroHeader({ className }: Props) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      <header className={cn("flex items-center w-full relative z-50", className)}>
        <div className="relative shrink-0 md:w-[100px] md:h-[18px] w-[80px] h-[14px]">
          <Link href="/" className="block">
            <Image alt="Laminar logo" src={logo} fill className="object-contain" priority />
          </Link>
        </div>
        <nav className="hidden md:flex md:gap-[32px] items-center font-sans md:text-sm text-landing-text-300 tracking-[0.02em] leading-normal whitespace-nowrap text-xs ml-[52px]">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              className="no-underline text-landing-text-300 hover:text-landing-text-200"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          className="md:hidden ml-auto p-1 text-landing-text-300"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {mobileMenuOpen ? <X className="size-5" /> : <Equal className="size-5" />}
        </button>
      </header>
      <div
        className={cn(
          "fixed left-0 right-0 bottom-0 top-[100px] z-40 bg-landing-surface-700 md:hidden transition-opacity duration-300",
          mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      >
        <nav className="flex flex-col px-[32px] pt-12 border-t border-t-landing-surface-400 gap-5">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              className="font-manrope text-[28px] leading-[30px] text-white no-underline hover:text-landing-text-200 tracking-tight"
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
