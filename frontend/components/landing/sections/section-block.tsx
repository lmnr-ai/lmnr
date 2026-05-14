import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { bodyMedium } from "../class-names";
import LearnMoreLink from "./learn-more-link";

interface Props {
  /** Plain string description gets bodyMedium styling. Pass a node when the description needs inline links etc. */
  description?: ReactNode;
  /** Visual mock for the block (placeholder for now). */
  visual: ReactNode;
  learnMore: { label: string; href: string };
  className?: string;
  /** Gap between the visual and the learn-more link. Default `gap-4` (16px); override per Figma. */
  linkGap?: string;
}

// Inner block of a section: optional description, the visual, and a learn-more
// link. A section can stack multiple blocks under a single title (see
// Understand why in seconds).
const SectionBlock = ({ description, visual, learnMore, className, linkGap = "gap-4" }: Props) => (
  <div className={cn("flex flex-col items-center w-full max-w-[500px] gap-6", className)}>
    {description && (typeof description === "string" ? <p className={bodyMedium}>{description}</p> : description)}
    <div className={cn("flex flex-col items-center w-full", linkGap)}>
      {visual}
      <LearnMoreLink {...learnMore} />
    </div>
  </div>
);

export default SectionBlock;
