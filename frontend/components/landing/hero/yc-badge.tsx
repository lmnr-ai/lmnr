import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const YCBadge = ({ className }: Props) => (
  <Link
    href="https://www.ycombinator.com/companies/laminar"
    target="_blank"
    className={cn("inline-flex items-center gap-2 no-underline", className)}
  >
    <Image src="/assets/landing/y-combinator.svg" alt="Y Combinator" width={16} height={16} />
    <span className="font-sans text-xs text-landing-text-300">Backed by Y-Combinator</span>
  </Link>
);

export default YCBadge;
