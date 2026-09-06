import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

interface Props {
  label: string;
  href: string;
  className?: string;
}

// The one outbound link a section gets, under its body copy. It replaced a
// footnote pinned inside each mock panel, which put the link on the artwork
// rather than on the sentence it belongs to.
const LearnMoreLink = ({ label, href, className }: Props) => (
  <Link
    href={href}
    target={href.startsWith("http") ? "_blank" : undefined}
    className={cn(
      "font-sans-landing inline-flex text-base items-center gap-2 text-primary-300 hover:text-primary-100 transition-colors",
      className
    )}
  >
    <span>{label}</span>
    <ArrowUpRight className="size-4 translate-y-[1px]" strokeWidth={2} />
  </Link>
);

export default LearnMoreLink;
