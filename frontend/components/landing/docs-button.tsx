import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  label?: string;
  href?: string;
}

const DocsButton = ({ className, label = "Docs", href = "https://docs.laminar.sh" }: Props) => (
  <Link
    href={href}
    target="_blank"
    className={cn(
      "flex gap-2 items-center no-underline text-landing-text-300 hover:text-landing-text-100 group",
      className
    )}
  >
    <p className="font-sans leading-normal text-sm  tracking-[0.02em]">{label}</p>
    <ArrowRight className="relative shrink-0 size-4 transition-all duration-100 group-hover:translate-x-2" />
  </Link>
);

export default DocsButton;
