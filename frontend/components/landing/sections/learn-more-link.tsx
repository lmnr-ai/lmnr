import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

interface Props {
  label: string;
  href: string;
  className?: string;
}

const LearnMoreLink = ({ label, href, className }: Props) => (
  <Link
    href={href}
    target={href.startsWith("http") ? "_blank" : undefined}
    className={cn(
      "inline-flex items-center gap-1 font-sans text-xs text-landing-text-300 no-underline hover:text-landing-text-400 transition-colors",
      className
    )}
  >
    <span>{label}</span>
    <ArrowRight className="size-3" strokeWidth={2} />
  </Link>
);

export default LearnMoreLink;
