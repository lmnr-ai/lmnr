import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { microLabel } from "../../class-names";

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
      microLabel,
      "inline-flex text-base items-center gap-2 hover:text-landing-text-200 transition-colors",
      className
    )}
  >
    <span>{label}</span>
    <ArrowUpRight className="size-4 translate-y-[1px]" strokeWidth={2} />
  </Link>
);

export default LearnMoreLink;
