import { type CSSProperties, forwardRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { subSection } from "../class-names";

interface Props {
  /** Plain strings honor `\n` line breaks via `whitespace-pre-line`. Pass a node when you need interactive title content. */
  title: ReactNode;
  children: ReactNode;
  className?: string;
  /** Margin between title and content. Default `mt-10` (40px) to match most sections; override per Figma. */
  titleSpacing?: string;
  style?: CSSProperties;
}

// Outer section wrapper: centered title + a column of SectionBlock(s). Gap
// between title and first block is 40px (Figma); gap between sibling blocks
// is 60px (Figma `Understand why` frame).
//
// Forwards `ref` to the outer <section> so callers can attach scroll-progress
// observers (see `get-alerts.tsx` driving framer's `useScroll`).
const Section = forwardRef<HTMLElement, Props>(({ title, children, className, titleSpacing = "mt-10", style }, ref) => (
  <section ref={ref} className={cn("flex flex-col items-center w-full px-6", className)} style={style}>
    <h2 className={subSection}>{title}</h2>
    <div className={cn("flex flex-col items-center gap-[60px] w-full", titleSpacing)}>{children}</div>
  </section>
));

Section.displayName = "Section";

export default Section;
