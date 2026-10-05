import Image from "next/image";
import Link from "next/link";

import BlinkingDotGrid from "./blinking-dot-grid";

const VIDEO_HREF = "https://x.com/skull8888888888/status/2107138967644541129?s=20";

export default function AnnouncementBanner() {
  // LandingHeader's mobile overlay assumes this 40px banner is mounted above it.
  // When removing the banner, restore its top-[100px] offset to top-[60px].
  return (
    <aside
      aria-label="Product announcement"
      className="relative flex h-10 w-full shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-300 px-4 font-sans-landing"
    >
      <div
        aria-hidden
        className="absolute inset-y-0 right-1/2 w-[50vw] overflow-hidden"
        style={{
          backgroundImage:
            "linear-gradient(to right, #333 1px, transparent 1px), linear-gradient(to bottom, #333 1px, transparent 1px)",
          backgroundPosition: "right 0 top 0, right 0 top 11px",
          backgroundSize: "18px 18px",
        }}
      >
        <BlinkingDotGrid />
      </div>
      <div className="relative flex w-full max-w-[880px] items-center justify-center whitespace-nowrap text-sm sm:text-base">
        <div
          aria-hidden
          className="absolute top-1/2 left-[-27px] h-11 w-[467px] -translate-y-1/2"
          style={{
            backgroundImage:
              "linear-gradient(to left, var(--color-surface-300) 0%, var(--color-surface-300) 50%, transparent 100%)",
          }}
        />
        <div className="relative flex items-center gap-3 sm:gap-5">
          <p className="relative text-white">
            <Image
              aria-hidden
              alt=""
              src="/assets/landing/dither-cloud-banner.png"
              width={572}
              height={40}
              className="pointer-events-none absolute top-1/2 left-full h-10 w-auto max-w-none -translate-y-1/2"
              style={{
                maskImage: "linear-gradient(to right, black 0%, black 75%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to right, black 0%, black 75%, transparent 100%)",
              }}
            />
            <span className="sm:hidden">
              Introducing <strong className="font-semibold">flow-1</strong>
            </span>
            <span className="hidden sm:inline">
              Introducing <strong className="font-semibold">flow-1</strong>, frontier trace intelligence at 1/20th of
              the cost
            </span>
          </p>
          <Link
            href={VIDEO_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="relative font-medium text-white underline underline-offset-2"
          >
            Watch the video
          </Link>
        </div>
      </div>
    </aside>
  );
}
