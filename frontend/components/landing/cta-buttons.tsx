import Link from "next/link";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

// Shared button pair used by the landing hero, the bottom-of-landing CTA
// section, and the blog post footer. Single source of truth for copy and
// styling — any tweak here propagates everywhere we close the marketing
// surface.
export default function CTAButtons({ className }: Props) {
  return (
    <div className={cn("flex flex-row gap-3 items-center", className)}>
      <Link
        href="/sign-up"
        className="flex items-center justify-center w-[160px] h-[36px] rounded-sm bg-landing-primary-200 hover:bg-landing-primary-400 transition-colors no-underline"
      >
        <span className="font-sans-landing font-medium text-sm text-black">Get started – free</span>
      </Link>
      <Link
        href="https://cal.com/robert-lmnr/demo"
        target="_blank"
        className="flex items-center justify-center w-[160px] h-[36px] rounded-sm border border-landing-text-600 hover:bg-landing-surface-600 transition-colors no-underline"
      >
        <span className="font-sans-landing font-medium text-sm text-landing-text-200">Book a demo</span>
      </Link>
    </div>
  );
}
