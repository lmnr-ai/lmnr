import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { LANDING_COLUMN_MAX_W, mainTitle } from "../class-names";
import Header from "../header";
import AgentCta from "./agent-cta";
import LogoStrip from "./logo-strip";

/** Apache-2.0, on the repo's own licence tab. */
const LICENSE_HREF = "https://github.com/lmnr-ai/lmnr?tab=Apache-2.0-1-ov-file#readme";

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
          {/* The column runs to 880px but a line stops being comfortable to read
              well before that, so the break is placed by hand at the clause. It
              is desktop-only — below md the viewport already wraps the line, and
              a hard break there just stacks a stub under a full line. */}
          <p className={cn("font-sans-landing text-[20px] text-foreground-200")}>
            Laminar is an{" "}
            {/* inline-flex, not flex: a block-level box here would break the
                sentence onto its own line.
                The arrow is set like a superscript, not like an icon. Lucide
                draws this glyph in the middle 10 of its 24-unit box, so the
                stock viewBox is 58% empty and no `size` can place it — cropping
                to the inked 12 units makes the box the ink. It is then hung off
                the baseline: 0.54em is the font's x-height, so raising it by
                that MINUS its own height lands its top on the top of the "e"s,
                which is the visual top of a word with no ascenders. Stroke is
                in viewBox units, so it has to scale inversely with the box to
                keep the ~1.1px weight the text has. */}
            <a
              href={LICENSE_HREF}
              target="_blank"
              rel="noreferrer"
              className="text-primary-300 hover:text-primary-200 transition-colors inline-flex items-baseline gap-1"
            >
              open-source
              <ArrowUpRight strokeWidth={2.2} viewBox="6 6 12 12" className="size-[0.32em] -translate-y-[0.22em]" />
            </a>
            {"  "}
            agent observability platform.
            <br className="hidden md:block" />
            It automatically catches agent failures and helps you fix them.
          </p>
        </div>

        <div className="flex flex-row gap-3 items-center">
          <Link
            href="/sign-up"
            className="flex items-center justify-center w-[160px] h-[36px] rounded-sm bg-primary-200 hover:bg-primary-400 transition-colors no-underline"
          >
            <span className="font-sans-landing font-medium text-sm text-black">Get started – free</span>
          </Link>
          <AgentCta />
        </div>
      </div>

      <LogoStrip className={LANDING_COLUMN_MAX_W} />
    </div>
  </div>
);

export default Hero;
