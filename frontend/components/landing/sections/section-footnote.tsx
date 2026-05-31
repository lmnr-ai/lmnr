import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { microLabel } from "../class-names";

interface Props {
  name: string;
  href: string;
}

// Absolutely-positioned label that sits at the bottom of a mock panel
// (a surface-550 wrapper). The parent must be `relative`. Pattern:
//
//   <div className="bg-landing-surface-550 relative ...">
//     <Mock />
//     <SectionFootnote name="Evals" href="..." />
//   </div>
//
// No step number — step numbering lives ABOVE each section's title
// (see has-this-issue.tsx etc.) so it's a single source of truth and
// the footnote stays as just name + learn more (no uppercasing).
const SectionFootnote = ({ name, href }: Props) => (
  <div
    className={cn(microLabel, "absolute bottom-0 left-0 right-0 z-20 flex justify-between w-full px-2 py-2 items-end")}
  >
    <span>{name}</span>
    <Link
      href={href}
      target="_blank"
      className="inline-flex items-center gap-1 hover:text-landing-text-200 transition-colors"
    >
      Learn more
      <ArrowUpRight className="size-4.5 translate-y-[1.5px]" strokeWidth={1.5} />
    </Link>
  </div>
);

export default SectionFootnote;
