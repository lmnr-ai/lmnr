import { cn } from "@/lib/utils";

import { bodyMedium } from "../../class-names";
import LearnMoreLink from "../learn-more-link";

// FLAG: "Read more" needs a real destination — once we publish a compression
// deep-dive, swap `/blog` for that post.

const BuiltForProduction = () => (
  <section className="flex flex-col items-start w-full py-20">
    <div className="flex flex-col gap-10 w-full">
      <p className="font-sans-landing font-medium text-foreground-50 text-[48px] leading-[50px] md:leading-[60px] tracking-[-0.02em]">
        20x cheaper storage
      </p>

      <div className="flex flex-col gap-10 md:flex-row md:gap-16 md:items-start w-full">
        <div className="flex flex-col gap-3 items-start shrink-0">
          <p className={cn(bodyMedium, "w-[320px]")}>
            Laminar stores only the unique content in agent runs, leading to faster ingestion and 20x cheaper storage.
          </p>

          <LearnMoreLink href="https://laminar.sh/blog/laminar-20x-agent-trace-compression" label="Read more" />
        </div>

        <div className="flex flex-col gap-1 items-start w-full md:flex-1 md:min-w-0 py-[7px] relative overflow-hidden">
          <div className="flex h-8.5 items-center justify-end px-3 whitespace-nowrap w-full rounded-sm bg-surface-300 text-foreground-50">
            <p className="font-medium">Competition</p>
          </div>
          {/* Laminar's bar is a twentieth of the one above it, drawn at rest.
              It used to shrink into that on scroll, which spent half a second
              showing the two as equal — the one thing the section is arguing
              they are not. Its label rides outside the bar (`left-full`), the
              only place it fits at this width. */}
          <div className="flex h-8.5 items-center w-full">
            <div className="relative flex h-full w-[5%] items-center rounded-sm bg-primary-300">
              <p className="absolute left-full top-0 flex h-full items-center px-3 whitespace-nowrap text-foreground-50">
                Laminar
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default BuiltForProduction;
